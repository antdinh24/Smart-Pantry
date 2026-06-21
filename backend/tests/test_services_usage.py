"""
test_services_usage.py

PURPOSE:
    Unit tests for UsageService — the service that enforces free-tier limits
    for receipt scanning (8/month) and recipe generation (10/month).

    These tests call UsageService methods directly with a mocked SQLAlchemy
    session. No HTTP layer is involved — that's covered separately in
    test_routers_receipts_scan.py and test_routers_recipes_usage.py.

WHAT'S BEING TESTED:
    - get_or_create: creates a row for new users
    - get_or_create: returns the existing row within the same month
    - get_or_create: RESETS counters when the month has rolled over (lazy reset)
    - check_receipt_limit: passes when user is under the 8-scan limit
    - check_receipt_limit: raises HTTP 429 at exactly 8 scans (at limit)
    - check_receipt_limit: raises HTTP 429 above 8 scans (over limit)
    - check_recipe_limit: passes when user is under the 10-generation limit
    - check_recipe_limit: raises HTTP 429 at exactly 10 generations
    - increment_receipt_scans: adds 1 to receipt_scans_this_month
    - increment_recipe_generations: adds 1 to recipe_generations_this_month
    - get_usage: returns the correct dict structure for the frontend

WHY THE LAZY RESET IS THE MOST IMPORTANT TEST:
    The reset logic is a subtle multi-condition: compare reset_date to today's
    month start. A bug here silently lets users bypass the free-tier limit
    indefinitely (they just never get their counter reset). These tests freeze
    `date.today()` to make the condition deterministic.

HOW THE DB IS MOCKED:
    SQLAlchemy sessions use a method-chain pattern:
        db.query(Model).filter(...).first()
    We build a Mock() chain that mirrors this structure. The 'first()' return
    value is what controls whether a user row exists or not.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import date
from fastapi import HTTPException

from app.services.usage import UsageService, RECEIPT_SCAN_LIMIT, RECIPE_GENERATION_LIMIT
from app.models.user_usage import UserUsage


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

# A valid UUID string for the test user — matches the format the service expects
TEST_USER_ID = "550e8400-e29b-41d4-a716-446655440000"


def make_mock_db(existing_usage=None):
    """
    Build a Mock SQLAlchemy session that returns `existing_usage` from
    db.query(UserUsage).filter(...).first().

    @param existing_usage - The UserUsage object to return, or None to simulate
                            a new user with no existing row.
    @returns               - A Mock session ready to pass into UsageService methods.
    """
    mock_db = Mock()
    mock_query = Mock()
    mock_filter = Mock()

    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_filter
    mock_filter.first.return_value = existing_usage

    return mock_db


def make_usage_row(
    receipt_scans=0,
    recipe_generations=0,
    reset_date=None,
):
    """
    Build a mock UserUsage row with the given counter values.

    @param receipt_scans      - receipt_scans_this_month value
    @param recipe_generations - recipe_generations_this_month value
    @param reset_date         - date object; defaults to first of the current month
    @returns                  - Mock object that looks like a UserUsage instance
    """
    if reset_date is None:
        reset_date = date.today().replace(day=1)

    usage = Mock(spec=UserUsage)
    usage.receipt_scans_this_month = receipt_scans
    usage.recipe_generations_this_month = recipe_generations
    usage.reset_date = reset_date
    return usage


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: get_or_create
# ─────────────────────────────────────────────────────────────────────────────

class TestGetOrCreate:
    """Tests for UsageService.get_or_create()"""

    def test_creates_row_for_new_user(self):
        """
        When no row exists for this user, get_or_create should add a new
        UserUsage row with zeroed counters and commit it.
        """
        mock_db = make_mock_db(existing_usage=None)

        result = UsageService.get_or_create(mock_db, TEST_USER_ID)

        # A new row was added to the session
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called()
        mock_db.refresh.assert_called()

        # The added object has zeroed counters
        added_object = mock_db.add.call_args[0][0]
        assert added_object.receipt_scans_this_month == 0
        assert added_object.recipe_generations_this_month == 0

    def test_returns_existing_row_same_month(self):
        """
        When a row already exists AND it's still the same month,
        get_or_create should return the row unchanged without resetting anything.
        """
        today = date.today()
        existing = make_usage_row(
            receipt_scans=3,
            recipe_generations=5,
            reset_date=today.replace(day=1),
        )
        mock_db = make_mock_db(existing_usage=existing)

        result = UsageService.get_or_create(mock_db, TEST_USER_ID)

        # Existing counters should be untouched
        assert result.receipt_scans_this_month == 3
        assert result.recipe_generations_this_month == 5
        # No new row was added
        mock_db.add.assert_not_called()

    def test_resets_counters_when_month_has_changed(self):
        """
        When the row's reset_date is in a past month, get_or_create must
        reset both counters to 0 and update reset_date to this month.

        This is the lazy monthly reset — no cron job needed because this
        runs on every usage check.
        """
        past_reset = date(2025, 3, 1)  # March — one month ago
        this_month_start = date(2025, 4, 1)

        existing = make_usage_row(
            receipt_scans=8,       # At the limit — should be reset to 0
            recipe_generations=10, # At the limit — should be reset to 0
            reset_date=past_reset,
        )
        mock_db = make_mock_db(existing_usage=existing)

        # Patch date so today() returns a MagicMock whose .replace() returns
        # the first of April. We can't assign .replace on a real date object
        # (it's read-only), so we use a MagicMock as the return value instead.
        with patch("app.services.usage.date") as mock_date:
            mock_today = MagicMock()
            mock_today.replace.return_value = this_month_start
            mock_date.today.return_value = mock_today

            result = UsageService.get_or_create(mock_db, TEST_USER_ID)

        # Both counters should be zeroed out
        assert result.receipt_scans_this_month == 0
        assert result.recipe_generations_this_month == 0
        # reset_date should be updated to the first of this month
        assert result.reset_date == this_month_start
        # The reset must be persisted
        mock_db.commit.assert_called()

    def test_does_not_reset_when_same_month(self):
        """
        Counters should NOT be reset if reset_date == this month's first day.
        This guards against an off-by-one where the first day of the month
        would trigger a spurious reset.
        """
        this_month_start = date(2025, 4, 1)

        existing = make_usage_row(
            receipt_scans=5,
            reset_date=this_month_start,  # Same as today's month start — no reset
        )
        mock_db = make_mock_db(existing_usage=existing)

        with patch("app.services.usage.date") as mock_date:
            mock_today = MagicMock()
            mock_today.replace.return_value = this_month_start
            mock_date.today.return_value = mock_today

            result = UsageService.get_or_create(mock_db, TEST_USER_ID)

        # Counter must NOT be reset — same month
        assert result.receipt_scans_this_month == 5


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: check_receipt_limit
# ─────────────────────────────────────────────────────────────────────────────

class TestCheckReceiptLimit:
    """Tests for UsageService.check_receipt_limit()"""

    def test_passes_when_under_limit(self):
        """
        A user who has used fewer than 8 scans this month should not
        get a 429 — check_receipt_limit should return without raising.
        """
        existing = make_usage_row(receipt_scans=3)
        mock_db = make_mock_db(existing_usage=existing)

        # Should not raise
        UsageService.check_receipt_limit(mock_db, TEST_USER_ID)

    def test_passes_when_at_zero(self):
        """New users (0 scans used) should always pass the limit check."""
        existing = make_usage_row(receipt_scans=0)
        mock_db = make_mock_db(existing_usage=existing)

        UsageService.check_receipt_limit(mock_db, TEST_USER_ID)

    def test_raises_429_at_limit(self):
        """
        When receipt_scans_this_month == RECEIPT_SCAN_LIMIT (8), a 429 must
        be raised. The limit is "strictly less than", so 8 scans = no more scans.
        """
        existing = make_usage_row(receipt_scans=RECEIPT_SCAN_LIMIT)
        mock_db = make_mock_db(existing_usage=existing)

        with pytest.raises(HTTPException) as exc_info:
            UsageService.check_receipt_limit(mock_db, TEST_USER_ID)

        assert exc_info.value.status_code == 429
        assert str(RECEIPT_SCAN_LIMIT) in exc_info.value.detail

    def test_raises_429_over_limit(self):
        """
        Even if somehow the counter exceeds the limit (e.g. due to a race
        condition), the check should still raise 429.
        """
        existing = make_usage_row(receipt_scans=RECEIPT_SCAN_LIMIT + 5)
        mock_db = make_mock_db(existing_usage=existing)

        with pytest.raises(HTTPException) as exc_info:
            UsageService.check_receipt_limit(mock_db, TEST_USER_ID)

        assert exc_info.value.status_code == 429

    def test_429_detail_mentions_limit(self):
        """
        The 429 error detail should be user-friendly and mention the limit
        so the frontend can display it directly.
        """
        existing = make_usage_row(receipt_scans=RECEIPT_SCAN_LIMIT)
        mock_db = make_mock_db(existing_usage=existing)

        with pytest.raises(HTTPException) as exc_info:
            UsageService.check_receipt_limit(mock_db, TEST_USER_ID)

        # Detail must mention the limit number and suggest upgrading
        assert str(RECEIPT_SCAN_LIMIT) in exc_info.value.detail
        detail_lower = exc_info.value.detail.lower()
        assert "upgrade" in detail_lower or "pro" in detail_lower


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: check_recipe_limit
# ─────────────────────────────────────────────────────────────────────────────

class TestCheckRecipeLimit:
    """Tests for UsageService.check_recipe_limit()"""

    def test_passes_when_under_limit(self):
        """User with fewer than 10 generations should not be blocked."""
        existing = make_usage_row(recipe_generations=4)
        mock_db = make_mock_db(existing_usage=existing)

        UsageService.check_recipe_limit(mock_db, TEST_USER_ID)

    def test_raises_429_at_limit(self):
        """
        When recipe_generations_this_month == RECIPE_GENERATION_LIMIT (10),
        a 429 must be raised.
        """
        existing = make_usage_row(recipe_generations=RECIPE_GENERATION_LIMIT)
        mock_db = make_mock_db(existing_usage=existing)

        with pytest.raises(HTTPException) as exc_info:
            UsageService.check_recipe_limit(mock_db, TEST_USER_ID)

        assert exc_info.value.status_code == 429

    def test_429_detail_mentions_cache_is_free(self):
        """
        The 429 detail for recipe generation must tell the user that cached
        recipes are always free — this is important UX context that prevents
        users from thinking they've lost access to all recipes.
        """
        existing = make_usage_row(recipe_generations=RECIPE_GENERATION_LIMIT)
        mock_db = make_mock_db(existing_usage=existing)

        with pytest.raises(HTTPException) as exc_info:
            UsageService.check_recipe_limit(mock_db, TEST_USER_ID)

        detail_lower = exc_info.value.detail.lower()
        assert "cache" in detail_lower or "free" in detail_lower


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: increment methods
# ─────────────────────────────────────────────────────────────────────────────

class TestIncrements:
    """Tests for increment_receipt_scans and increment_recipe_generations."""

    def test_increment_receipt_scans_adds_one(self):
        """
        increment_receipt_scans should add exactly 1 to the receipt counter
        and commit the change.
        """
        existing = make_usage_row(receipt_scans=3)
        mock_db = make_mock_db(existing_usage=existing)

        UsageService.increment_receipt_scans(mock_db, TEST_USER_ID)

        assert existing.receipt_scans_this_month == 4
        mock_db.commit.assert_called()

    def test_increment_recipe_generations_adds_one(self):
        """
        increment_recipe_generations should add exactly 1 to the recipe
        counter and commit the change.
        """
        existing = make_usage_row(recipe_generations=7)
        mock_db = make_mock_db(existing_usage=existing)

        UsageService.increment_recipe_generations(mock_db, TEST_USER_ID)

        assert existing.recipe_generations_this_month == 8
        mock_db.commit.assert_called()

    def test_increment_receipt_does_not_affect_recipe_counter(self):
        """Incrementing receipt scans must NOT touch recipe_generations."""
        existing = make_usage_row(receipt_scans=2, recipe_generations=5)
        mock_db = make_mock_db(existing_usage=existing)

        UsageService.increment_receipt_scans(mock_db, TEST_USER_ID)

        assert existing.recipe_generations_this_month == 5  # unchanged

    def test_increment_recipe_does_not_affect_receipt_counter(self):
        """Incrementing recipe generations must NOT touch receipt_scans."""
        existing = make_usage_row(receipt_scans=6, recipe_generations=3)
        mock_db = make_mock_db(existing_usage=existing)

        UsageService.increment_recipe_generations(mock_db, TEST_USER_ID)

        assert existing.receipt_scans_this_month == 6  # unchanged


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: get_usage
# ─────────────────────────────────────────────────────────────────────────────

class TestGetUsage:
    """Tests for UsageService.get_usage()"""

    def test_returns_correct_structure(self):
        """
        get_usage should return a dict with six keys that the frontend uses
        to display "3 of 8 scans used this month".
        """
        # Use the current month's start date so the lazy reset doesn't fire
        # and wipe the counters before get_usage reads them.
        existing = make_usage_row(
            receipt_scans=3,
            recipe_generations=7,
            # reset_date defaults to date.today().replace(day=1) in make_usage_row
        )
        mock_db = make_mock_db(existing_usage=existing)

        result = UsageService.get_usage(mock_db, TEST_USER_ID)

        assert result["receipt_scans_used"] == 3
        assert result["receipt_scans_limit"] == RECEIPT_SCAN_LIMIT
        assert result["recipe_generations_used"] == 7
        assert result["recipe_generations_limit"] == RECIPE_GENERATION_LIMIT
        assert "reset_date" in result

    def test_limits_match_constants(self):
        """
        The limits returned by get_usage must exactly match the module-level
        constants. If someone changes RECEIPT_SCAN_LIMIT, get_usage must
        reflect the new value automatically — not a hardcoded number.
        """
        existing = make_usage_row()
        mock_db = make_mock_db(existing_usage=existing)

        result = UsageService.get_usage(mock_db, TEST_USER_ID)

        assert result["receipt_scans_limit"] == RECEIPT_SCAN_LIMIT
        assert result["recipe_generations_limit"] == RECIPE_GENERATION_LIMIT

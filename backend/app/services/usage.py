"""
usage.py

PURPOSE:
    UsageService enforces free-tier limits for receipt scanning and recipe
    generation. It manages the user_usage table — creating rows for new users,
    resetting counters monthly, and raising HTTP 429 when limits are exceeded.

WHY THIS IS A SERVICE (not inline router logic)?
    The same limit checks are needed in two routers (receipts and recipes).
    Keeping the logic here means both routers call the same code, so changing
    a limit (e.g. 8 → 10 scans) only requires editing one file.

MONTHLY RESET — how it works:
    Every usage check calls get_or_create(), which compares today's date to
    the row's reset_date. If today is in a new month (today > reset_date),
    the counters are zeroed and reset_date is set to the first of this month.
    This lazy reset means no cron job or background task is needed.

LIMITS:
    Receipt scans:      8 per month  (free tier)
    Recipe generations: 10 per month (free tier, cache hits excluded)
"""

from datetime import date
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.user_usage import UserUsage
import uuid


# Free tier limits — change these to adjust limits without touching router code
RECEIPT_SCAN_LIMIT = 8
RECIPE_GENERATION_LIMIT = 10


class UsageService:
    """
    Service for tracking and enforcing free-tier usage limits.

    All methods are static — no instance state needed.
    """

    @staticmethod
    def get_or_create(db: Session, user_id: str) -> UserUsage:
        """
        Fetch the usage row for this user, creating it if it doesn't exist.
        Also resets counters if the current month has passed the reset_date.

        This is called before every limit check and increment so that:
          - New users automatically get a fresh row
          - Counters are always current for this month

        HOW THE RESET WORKS:
            reset_date is stored as the first day of the month the counters
            cover (e.g. 2025-04-01 for April 2025).
            If today >= the first of a new month (today.replace(day=1) > reset_date),
            the counters are zeroed and reset_date is updated.

        @param db      - SQLAlchemy database session
        @param user_id - UUID string of the authenticated user
        @returns       - The UserUsage row (always fresh for this month)
        """
        user_uuid = uuid.UUID(user_id)
        usage = db.query(UserUsage).filter(UserUsage.user_id == user_uuid).first()

        today = date.today()
        this_month_start = today.replace(day=1)

        if not usage:
            # First time this user has hit a usage-tracked endpoint —
            # create a fresh row with zeroed counters
            usage = UserUsage(
                user_id=user_uuid,
                receipt_scans_this_month=0,
                recipe_generations_this_month=0,
                reset_date=this_month_start,
            )
            db.add(usage)
            db.commit()
            db.refresh(usage)

        elif usage.reset_date < this_month_start:
            # The stored reset_date is in a past month — reset counters.
            # This is the lazy monthly reset: no cron job needed.
            usage.receipt_scans_this_month = 0
            usage.recipe_generations_this_month = 0
            usage.reset_date = this_month_start
            db.commit()
            db.refresh(usage)

        return usage

    @staticmethod
    def check_receipt_limit(db: Session, user_id: str) -> None:
        """
        Verify the user has not exceeded their monthly receipt scan limit.

        Raises HTTP 429 (Too Many Requests) if the limit is reached, with a
        message the frontend can display directly to the user.

        Called at the start of POST /receipts/scan, before any GPT-4o call,
        so users don't waste a scan if they're already over the limit.

        @param db      - SQLAlchemy database session
        @param user_id - UUID string of the authenticated user
        @raises        - HTTPException 429 if limit exceeded
        """
        usage = UsageService.get_or_create(db, user_id)

        if usage.receipt_scans_this_month >= RECEIPT_SCAN_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"You've used all {RECEIPT_SCAN_LIMIT} free receipt scans "
                    f"for this month. Upgrade to Pro for unlimited scans."
                ),
            )

    @staticmethod
    def check_recipe_limit(db: Session, user_id: str) -> None:
        """
        Verify the user has not exceeded their monthly recipe generation limit.

        Only applies to actual OpenAI calls — cache hits are free and do not
        count toward the limit. This check happens before the generation attempt,
        but the counter is only incremented if from_cache is False.

        Raises HTTP 429 if the limit is reached.

        @param db      - SQLAlchemy database session
        @param user_id - UUID string of the authenticated user
        @raises        - HTTPException 429 if limit exceeded
        """
        usage = UsageService.get_or_create(db, user_id)

        if usage.recipe_generations_this_month >= RECIPE_GENERATION_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"You've used all {RECIPE_GENERATION_LIMIT} free recipe "
                    f"generations for this month. Upgrade to Pro for unlimited "
                    f"generations. Note: recipes from the shared cache are always free."
                ),
            )

    @staticmethod
    def increment_receipt_scans(db: Session, user_id: str) -> None:
        """
        Add 1 to the user's receipt scan counter for this month.

        Called after a successful GPT-4o vision scan — not before, so a
        failed scan (network error, API down) doesn't consume a user's quota.

        @param db      - SQLAlchemy database session
        @param user_id - UUID string of the authenticated user
        """
        usage = UsageService.get_or_create(db, user_id)
        usage.receipt_scans_this_month += 1
        db.commit()

    @staticmethod
    def increment_recipe_generations(db: Session, user_id: str) -> None:
        """
        Add 1 to the user's recipe generation counter for this month.

        Called only when from_cache is False — meaning GPT-4o was actually
        invoked and incurred a cost. Cache hits are free and must NOT call this.

        @param db      - SQLAlchemy database session
        @param user_id - UUID string of the authenticated user
        """
        usage = UsageService.get_or_create(db, user_id)
        usage.recipe_generations_this_month += 1
        db.commit()

    @staticmethod
    def get_usage(db: Session, user_id: str) -> dict:
        """
        Return the current usage counts and limits for a user.

        Used by a GET /usage endpoint so the frontend can display
        "3 of 8 receipt scans used this month" in the UI.

        @param db      - SQLAlchemy database session
        @param user_id - UUID string of the authenticated user
        @returns       - Dict with current counts, limits, and reset date
        """
        usage = UsageService.get_or_create(db, user_id)

        return {
            "receipt_scans_used": usage.receipt_scans_this_month,
            "receipt_scans_limit": RECEIPT_SCAN_LIMIT,
            "recipe_generations_used": usage.recipe_generations_this_month,
            "recipe_generations_limit": RECIPE_GENERATION_LIMIT,
            "reset_date": usage.reset_date.isoformat(),
        }

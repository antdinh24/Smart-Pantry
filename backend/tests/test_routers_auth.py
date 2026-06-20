"""
test_routers_auth.py

PURPOSE:
    HTTP-level tests for the authentication router. Covers all five endpoints:

        POST /api/v1/auth/register  — create a new account
        POST /api/v1/auth/login     — sign in with email + password
        POST /api/v1/auth/logout    — sign out (requires valid token)
        GET  /api/v1/auth/me        — get current user profile (requires token)
        POST /api/v1/auth/refresh   — exchange a refresh token for new tokens

HOW SUPABASE IS MOCKED:
    The auth router creates a module-level Supabase client:
        supabase = create_client(settings.supabase_url, settings.supabase_key)

    conftest.py patches `supabase.create_client` at import time, so
    `app.routers.auth.supabase` is already a Mock object when tests run.
    Individual tests patch specific methods on that Mock:
        @patch("app.routers.auth.supabase.auth.sign_up", ...)
        @patch("app.routers.auth.supabase.auth.sign_in_with_password", ...)
        @patch("app.routers.auth.supabase.auth.sign_out", ...)
        @patch("app.routers.auth.supabase.auth.refresh_session", ...)

HOW THE DB IS MOCKED:
    Same pattern as all other router tests: override_db installs a Mock
    session via app.dependency_overrides[get_db].

    For login/refresh, the DB query chain is configured:
        mock_db.query.return_value.filter.return_value.first.return_value = mock_user

HOW GET /me IS TESTED:
    GET /me uses get_current_user (not just get_current_user_id). This
    dependency queries the DB for the full User object after validating the
    JWT. For success tests we override the dependency entirely so we can
    inject a pre-built mock user without involving the DB at all.
    For the 404 test we let the real dependency run against a mock DB that
    returns None, which triggers the 404 naturally.

IMPORTANT — UUID STRING REQUIREMENT:
    The register handler calls uuid.UUID(auth_response.user.id). If user.id
    is a Mock object rather than a real UUID string, this raises a TypeError.
    All mock Supabase responses must use real UUID strings for user IDs.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_db
from app.middleware.auth import get_current_user

# ─────────────────────────────────────────────────────────────────────────────
# URL CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL    = "/api/v1/auth/login"
LOGOUT_URL   = "/api/v1/auth/logout"
ME_URL       = "/api/v1/auth/me"
REFRESH_URL  = "/api/v1/auth/refresh"

# ─────────────────────────────────────────────────────────────────────────────
# SAMPLE DATA
# ─────────────────────────────────────────────────────────────────────────────

# Must be a real UUID string — auth.py calls uuid.UUID(auth_response.user.id)
AUTH_USER_ID = "550e8400-e29b-41d4-a716-446655440000"

VALID_EMAIL    = "test@example.com"
VALID_PASSWORD = "SecurePass123!"

VALID_REGISTER_PAYLOAD = {"email": VALID_EMAIL, "password": VALID_PASSWORD}
VALID_LOGIN_PAYLOAD    = {"email": VALID_EMAIL, "password": VALID_PASSWORD}


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def make_supabase_auth_response(
    user_id: str = AUTH_USER_ID,
    email: str = VALID_EMAIL,
    access_token: str = "test-access-token-xyz",
    refresh_token: str = "test-refresh-token-xyz",
) -> Mock:
    """
    Build a mock Supabase auth response (what sign_up / sign_in / refresh_session return).

    IMPORTANT: user_id must be a real UUID string. The register handler calls
    uuid.UUID(auth_response.user.id); a Mock object there raises TypeError.

    Args:
        user_id: UUID string for the Supabase user
        email: User's email address
        access_token: JWT access token string
        refresh_token: Long-lived refresh token string
    """
    mock = Mock()
    mock.user = Mock()
    mock.user.id = user_id       # real string, not a Mock — uuid.UUID() requires this
    mock.user.email = email
    mock.session = Mock()
    mock.session.access_token = access_token
    mock.session.refresh_token = refresh_token
    return mock


def make_supabase_no_user_response() -> Mock:
    """
    Mock Supabase response where .user is None.
    Used to test the "registration failed / invalid credentials" path.
    """
    mock = Mock()
    mock.user = None
    mock.session = None
    return mock


def make_db_user(
    user_id: str = AUTH_USER_ID,
    email: str = VALID_EMAIL,
    subscription_status: str = "free",
) -> Mock:
    """
    Build a mock User ORM object. Used to configure DB query results and
    to override the get_current_user dependency for GET /me tests.

    Args:
        user_id: UUID string matching the Supabase auth user ID
        email: User's email
        subscription_status: "free" or "premium"
    """
    mock = Mock()
    mock.id = "aaaaaaaa-0000-0000-0000-111111111111"  # our DB primary key (different from user_id)
    mock.user_id = user_id
    mock.email = email
    mock.subscription_status = subscription_status
    mock.subscription_end_date = None
    mock.to_dict.return_value = {
        "id": "aaaaaaaa-0000-0000-0000-111111111111",
        "user_id": user_id,
        "email": email,
        "subscription_status": subscription_status,
        "subscription_end_date": None,
        "created_at": "2024-01-01T00:00:00",
        "updated_at": "2024-01-15T12:00:00",
    }
    return mock


# ─────────────────────────────────────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db():
    """Mock SQLAlchemy session. DB method calls are no-ops unless configured."""
    db = Mock()
    db.add = Mock()
    db.commit = Mock()
    db.refresh = Mock()
    db.rollback = Mock()
    return db


@pytest.fixture
def override_db(mock_db):
    """
    Install the mock DB as the FastAPI get_db dependency.
    Tears down after each test to prevent bleed-through.
    """
    app.dependency_overrides[get_db] = lambda: mock_db
    yield mock_db
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: POST /auth/register
# ─────────────────────────────────────────────────────────────────────────────

class TestRegister:
    """
    Tests for POST /api/v1/auth/register.

    Flow: Supabase sign_up → create User in DB → return AuthResponse.
    No auth token required (this is how accounts are created).
    """

    # ── Validation (422) ──────────────────────────────────────────────────────

    def test_returns_422_when_email_missing(self, client, override_db):
        """email is a required field — omitting it returns 422."""
        response = client.post(REGISTER_URL, json={"password": VALID_PASSWORD})
        assert response.status_code == 422

    def test_returns_422_when_password_missing(self, client, override_db):
        """password is a required field — omitting it returns 422."""
        response = client.post(REGISTER_URL, json={"email": VALID_EMAIL})
        assert response.status_code == 422

    def test_returns_422_for_invalid_email_format(self, client, override_db):
        """
        email uses Pydantic's EmailStr validator. A string that isn't a valid
        email address (no @, no domain) is rejected before Supabase is called.
        """
        response = client.post(
            REGISTER_URL,
            json={"email": "notanemail", "password": VALID_PASSWORD},
        )
        assert response.status_code == 422

    def test_returns_422_for_empty_body(self, client, override_db):
        """Sending {} (both required fields missing) returns 422."""
        response = client.post(REGISTER_URL, json={})
        assert response.status_code == 422

    # ── Success (201) ─────────────────────────────────────────────────────────

    @patch(
        "app.routers.auth.supabase.auth.sign_up",
        return_value=make_supabase_auth_response(),
    )
    def test_returns_201_on_success(self, mock_signup, client, override_db):
        """
        A valid email + password with a successful Supabase response returns 201.
        The DB write (add/commit/refresh) is mocked as a no-op.
        """
        response = client.post(REGISTER_URL, json=VALID_REGISTER_PAYLOAD)
        assert response.status_code == 201

    @patch(
        "app.routers.auth.supabase.auth.sign_up",
        return_value=make_supabase_auth_response(),
    )
    def test_response_contains_all_auth_fields(self, mock_signup, client, override_db):
        """
        The 201 response body must contain all AuthResponse fields:
        user_id, email, access_token, refresh_token, subscription_status.
        """
        response = client.post(REGISTER_URL, json=VALID_REGISTER_PAYLOAD)
        data = response.json()

        assert data["user_id"] == AUTH_USER_ID
        assert data["email"] == VALID_EMAIL
        assert data["access_token"] == "test-access-token-xyz"
        assert data["refresh_token"] == "test-refresh-token-xyz"
        assert data["subscription_status"] == "free"

    @patch(
        "app.routers.auth.supabase.auth.sign_up",
        return_value=make_supabase_auth_response(),
    )
    def test_new_users_are_registered_as_free_tier(
        self, mock_signup, client, override_db
    ):
        """All new accounts start on the free subscription tier."""
        response = client.post(REGISTER_URL, json=VALID_REGISTER_PAYLOAD)
        assert response.json()["subscription_status"] == "free"

    # ── Failure paths ─────────────────────────────────────────────────────────

    @patch(
        "app.routers.auth.supabase.auth.sign_up",
        return_value=make_supabase_no_user_response(),
    )
    def test_returns_400_when_supabase_returns_no_user(
        self, mock_signup, client, override_db
    ):
        """
        If Supabase sign_up returns a response with user=None (can happen when
        email confirmation is required or the account already exists), the
        endpoint returns 400, not 500.
        """
        response = client.post(REGISTER_URL, json=VALID_REGISTER_PAYLOAD)
        assert response.status_code == 400

    @patch(
        "app.routers.auth.supabase.auth.sign_up",
        side_effect=Exception("User already exists"),
    )
    def test_returns_400_when_email_already_registered(
        self, mock_signup, client, override_db
    ):
        """
        When Supabase raises an exception containing "already exists", the
        handler recognises it as a duplicate email and returns 400 (not 500).
        This is the expected path when a user tries to register twice.
        """
        response = client.post(REGISTER_URL, json=VALID_REGISTER_PAYLOAD)
        assert response.status_code == 400

    @patch(
        "app.routers.auth.supabase.auth.sign_up",
        side_effect=Exception("duplicate key value violates unique constraint"),
    )
    def test_returns_400_for_duplicate_key_exception(
        self, mock_signup, client, override_db
    ):
        """
        The handler also catches the word "duplicate" in the exception message
        (PostgreSQL error format) and maps it to 400.
        """
        response = client.post(REGISTER_URL, json=VALID_REGISTER_PAYLOAD)
        assert response.status_code == 400

    @patch(
        "app.routers.auth.supabase.auth.sign_up",
        side_effect=Exception("Supabase service unavailable"),
    )
    def test_returns_500_on_unexpected_supabase_error(
        self, mock_signup, client, override_db
    ):
        """
        An unexpected Supabase error (not a duplicate) should return 500.
        The user gets a generic failure message.
        """
        no_raise_client = TestClient(app, raise_server_exceptions=False)
        response = no_raise_client.post(
            REGISTER_URL,
            json=VALID_REGISTER_PAYLOAD,
        )
        # The handler raises HTTPException(500) — but depending on whether
        # FastAPI re-raises HTTPException, this may be 500 directly
        assert response.status_code == 500


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: POST /auth/login
# ─────────────────────────────────────────────────────────────────────────────

class TestLogin:
    """
    Tests for POST /api/v1/auth/login.

    Flow: Supabase sign_in_with_password → query DB for User → return AuthResponse.
    No auth token required.
    """

    # ── Validation (422) ──────────────────────────────────────────────────────

    def test_returns_422_when_email_missing(self, client, override_db):
        """email is required."""
        response = client.post(LOGIN_URL, json={"password": VALID_PASSWORD})
        assert response.status_code == 422

    def test_returns_422_when_password_missing(self, client, override_db):
        """password is required."""
        response = client.post(LOGIN_URL, json={"email": VALID_EMAIL})
        assert response.status_code == 422

    def test_returns_422_for_invalid_email_format(self, client, override_db):
        """Non-email string in the email field fails Pydantic EmailStr validation."""
        response = client.post(
            LOGIN_URL,
            json={"email": "not-valid", "password": VALID_PASSWORD},
        )
        assert response.status_code == 422

    # ── Success (200) ─────────────────────────────────────────────────────────

    @patch(
        "app.routers.auth.supabase.auth.sign_in_with_password",
        return_value=make_supabase_auth_response(),
    )
    def test_returns_200_on_success(self, mock_signin, client, override_db):
        """Valid credentials with a matching DB user return 200."""
        override_db.query.return_value.filter.return_value.first.return_value = (
            make_db_user()
        )
        response = client.post(LOGIN_URL, json=VALID_LOGIN_PAYLOAD)
        assert response.status_code == 200

    @patch(
        "app.routers.auth.supabase.auth.sign_in_with_password",
        return_value=make_supabase_auth_response(),
    )
    def test_response_contains_all_auth_fields(self, mock_signin, client, override_db):
        """The 200 response must include all AuthResponse fields."""
        override_db.query.return_value.filter.return_value.first.return_value = (
            make_db_user()
        )

        response = client.post(LOGIN_URL, json=VALID_LOGIN_PAYLOAD)
        data = response.json()

        assert data["user_id"] == AUTH_USER_ID
        assert data["email"] == VALID_EMAIL
        assert data["access_token"] == "test-access-token-xyz"
        assert data["refresh_token"] == "test-refresh-token-xyz"
        assert "subscription_status" in data

    # ── Failure paths ─────────────────────────────────────────────────────────

    @patch(
        "app.routers.auth.supabase.auth.sign_in_with_password",
        return_value=make_supabase_no_user_response(),
    )
    def test_returns_401_when_supabase_returns_no_session(
        self, mock_signin, client, override_db
    ):
        """
        If Supabase returns user=None / session=None (wrong password), the
        endpoint returns 401 Unauthorized — not 400 or 500.
        """
        response = client.post(LOGIN_URL, json=VALID_LOGIN_PAYLOAD)
        assert response.status_code == 401

    @patch(
        "app.routers.auth.supabase.auth.sign_in_with_password",
        return_value=make_supabase_auth_response(),
    )
    def test_returns_404_when_user_not_in_database(
        self, mock_signin, client, override_db
    ):
        """
        Supabase auth succeeds but there's no matching row in our users table.
        (Can happen if the DB insert during registration was rolled back.)
        Returns 404 with a "please register first" message.
        """
        # DB query returns None — user not found
        override_db.query.return_value.filter.return_value.first.return_value = None

        response = client.post(LOGIN_URL, json=VALID_LOGIN_PAYLOAD)
        assert response.status_code == 404

    @patch(
        "app.routers.auth.supabase.auth.sign_in_with_password",
        side_effect=Exception("Network error"),
    )
    def test_returns_401_on_supabase_exception(
        self, mock_signin, client, override_db
    ):
        """
        A generic exception from Supabase (network error, timeout, etc.) is
        caught and converted to 401. The handler treats all sign-in failures
        as authentication failures, not server errors.
        """
        response = client.post(LOGIN_URL, json=VALID_LOGIN_PAYLOAD)
        assert response.status_code == 401


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: POST /auth/logout
# ─────────────────────────────────────────────────────────────────────────────

class TestLogout:
    """
    Tests for POST /api/v1/auth/logout.

    Requires a valid auth token. Calls supabase.auth.sign_out() and returns
    a success message. No request body needed.
    """

    def test_returns_403_without_auth(self, client):
        """Logout without a token must be rejected."""
        response = client.post(LOGOUT_URL)
        assert response.status_code in (401, 403)

    @patch("app.routers.auth.supabase.auth.sign_out", return_value=None)
    def test_returns_200_on_success(self, mock_signout, client, auth_headers):
        """A valid token + successful Supabase sign_out returns 200."""
        response = client.post(LOGOUT_URL, headers=auth_headers)
        assert response.status_code == 200

    @patch("app.routers.auth.supabase.auth.sign_out", return_value=None)
    def test_response_body_contains_success_status(
        self, mock_signout, client, auth_headers
    ):
        """
        The response body must include status="success" so the frontend can
        detect a clean logout vs. a server error response.
        """
        response = client.post(LOGOUT_URL, headers=auth_headers)
        data = response.json()

        assert data["status"] == "success"
        assert "message" in data

    @patch(
        "app.routers.auth.supabase.auth.sign_out",
        side_effect=Exception("Supabase connection lost"),
    )
    def test_returns_500_when_supabase_sign_out_raises(
        self, mock_signout, client, auth_headers
    ):
        """
        If Supabase sign_out raises, the endpoint returns 500. The user is
        informed that logout failed so they can retry.
        """
        no_raise_client = TestClient(app, raise_server_exceptions=False)
        response = no_raise_client.post(LOGOUT_URL, headers=auth_headers)
        assert response.status_code == 500

    @patch("app.routers.auth.supabase.auth.sign_out", return_value=None)
    def test_sign_out_is_called_on_logout(self, mock_signout, client, auth_headers):
        """
        Supabase sign_out must actually be called when the endpoint is hit.
        If it isn't, the user's session would still be valid on the Supabase side.
        """
        client.post(LOGOUT_URL, headers=auth_headers)
        mock_signout.assert_called_once()


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: GET /auth/me
# ─────────────────────────────────────────────────────────────────────────────

class TestGetMe:
    """
    Tests for GET /api/v1/auth/me.

    Uses the get_current_user dependency, which validates the JWT token and
    then fetches the full User object from the database.

    For success tests: override get_current_user entirely to inject a mock user.
    For the 404 test: let the real dependency run against a mock DB that returns None.
    """

    def test_returns_403_without_auth(self, client):
        """Request without a token must be rejected before reaching the handler."""
        response = client.get(ME_URL)
        assert response.status_code in (401, 403)

    def test_returns_200_with_correct_shape(self, client, auth_headers):
        """
        A valid token returns 200 with a complete UserResponse.

        WHY override get_current_user instead of mocking the DB?
            get_current_user does its own DB query independently of the test's
            override_db fixture. Overriding the dependency itself is simpler
            and avoids having to wire up the query chain in two places.
        """
        mock_user = make_db_user()
        app.dependency_overrides[get_current_user] = lambda: mock_user

        try:
            response = client.get(ME_URL, headers=auth_headers)
            assert response.status_code == 200
        finally:
            # Always clear the override so it doesn't affect other tests
            app.dependency_overrides.pop(get_current_user, None)

    def test_response_includes_all_user_fields(self, client, auth_headers):
        """The UserResponse must include all defined fields."""
        mock_user = make_db_user()
        app.dependency_overrides[get_current_user] = lambda: mock_user

        try:
            response = client.get(ME_URL, headers=auth_headers)
            data = response.json()

            required_fields = [
                "id", "user_id", "email", "subscription_status",
                "subscription_end_date", "created_at", "updated_at",
            ]
            for field in required_fields:
                assert field in data, f"Missing field: {field}"
        finally:
            app.dependency_overrides.pop(get_current_user, None)

    def test_subscription_status_is_included_in_response(
        self, client, auth_headers
    ):
        """
        subscription_status must be present so the frontend knows whether to
        show free-tier limits or premium features.
        """
        mock_user = make_db_user(subscription_status="free")
        app.dependency_overrides[get_current_user] = lambda: mock_user

        try:
            response = client.get(ME_URL, headers=auth_headers)
            assert response.json()["subscription_status"] == "free"
        finally:
            app.dependency_overrides.pop(get_current_user, None)

    def test_returns_404_when_user_not_in_database(
        self, client, override_db, auth_headers
    ):
        """
        Valid JWT token but no matching row in the users table → 404.
        This tests the real get_current_user dependency path where the DB
        query returns None and the dependency raises HTTPException(404).

        We do NOT override get_current_user here — we let it run and supply
        a mock DB that returns None from the user query.
        """
        # Configure the DB query chain to return None (no user found)
        override_db.query.return_value.filter.return_value.first.return_value = None

        response = client.get(ME_URL, headers=auth_headers)
        assert response.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: POST /auth/refresh
# ─────────────────────────────────────────────────────────────────────────────

class TestRefreshToken:
    """
    Tests for POST /api/v1/auth/refresh.

    Accepts a refresh token in the request body (no auth header needed).
    Calls supabase.auth.refresh_session(), then queries the DB for the user,
    and returns a new AuthResponse with fresh tokens.
    """

    # ── Validation (422) ──────────────────────────────────────────────────────

    def test_returns_422_when_refresh_token_missing(self, client, override_db):
        """refresh_token is required — omitting it returns 422."""
        response = client.post(REFRESH_URL, json={})
        assert response.status_code == 422

    # ── Success (200) ─────────────────────────────────────────────────────────

    @patch(
        "app.routers.auth.supabase.auth.refresh_session",
        return_value=make_supabase_auth_response(
            access_token="new-access-token",
            refresh_token="new-refresh-token",
        ),
    )
    def test_returns_200_on_success(self, mock_refresh, client, override_db):
        """A valid refresh token with a matching DB user returns 200."""
        override_db.query.return_value.filter.return_value.first.return_value = (
            make_db_user()
        )
        response = client.post(REFRESH_URL, json={"refresh_token": "old-refresh-token"})
        assert response.status_code == 200

    @patch(
        "app.routers.auth.supabase.auth.refresh_session",
        return_value=make_supabase_auth_response(
            access_token="new-access-token",
            refresh_token="new-refresh-token",
        ),
    )
    def test_response_contains_fresh_tokens(self, mock_refresh, client, override_db):
        """
        The response must include the NEW tokens returned by Supabase, not
        the old ones passed in the request. This is the whole point of refresh.
        """
        override_db.query.return_value.filter.return_value.first.return_value = (
            make_db_user()
        )

        response = client.post(REFRESH_URL, json={"refresh_token": "old-refresh-token"})
        data = response.json()

        assert data["access_token"] == "new-access-token"
        assert data["refresh_token"] == "new-refresh-token"

    @patch(
        "app.routers.auth.supabase.auth.refresh_session",
        return_value=make_supabase_auth_response(),
    )
    def test_response_contains_all_auth_fields(self, mock_refresh, client, override_db):
        """The AuthResponse shape must be complete (same fields as login/register)."""
        override_db.query.return_value.filter.return_value.first.return_value = (
            make_db_user()
        )

        response = client.post(REFRESH_URL, json={"refresh_token": "valid-token"})
        data = response.json()

        required_fields = [
            "user_id", "email", "access_token", "refresh_token", "subscription_status"
        ]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"

    # ── Failure paths ─────────────────────────────────────────────────────────

    @patch(
        "app.routers.auth.supabase.auth.refresh_session",
        return_value=make_supabase_no_user_response(),
    )
    def test_returns_401_when_supabase_returns_no_session(
        self, mock_refresh, client, override_db
    ):
        """
        If Supabase returns user=None / session=None (expired or invalid
        refresh token), the endpoint returns 401.
        """
        response = client.post(REFRESH_URL, json={"refresh_token": "expired-token"})
        assert response.status_code == 401

    @patch(
        "app.routers.auth.supabase.auth.refresh_session",
        return_value=make_supabase_auth_response(),
    )
    def test_returns_404_when_user_not_in_database(
        self, mock_refresh, client, override_db
    ):
        """
        Token is valid but no matching user row in our DB → 404.
        Edge case: user deleted their account but still has valid tokens.
        """
        override_db.query.return_value.filter.return_value.first.return_value = None

        response = client.post(REFRESH_URL, json={"refresh_token": "valid-token"})
        assert response.status_code == 404

    @patch(
        "app.routers.auth.supabase.auth.refresh_session",
        side_effect=Exception("Token has expired"),
    )
    def test_returns_401_on_supabase_exception(
        self, mock_refresh, client, override_db
    ):
        """
        Any exception from Supabase during refresh is treated as an auth
        failure and returns 401. The handler explicitly maps all exceptions
        to 401 for this endpoint.
        """
        response = client.post(REFRESH_URL, json={"refresh_token": "bad-token"})
        assert response.status_code == 401

    @patch(
        "app.routers.auth.supabase.auth.refresh_session",
        return_value=make_supabase_auth_response(),
    )
    def test_refresh_session_called_with_token_from_request(
        self, mock_refresh, client, override_db
    ):
        """
        The refresh token from the request body must be forwarded to Supabase
        unchanged. If the router passes the wrong value, the refresh fails on
        the Supabase side even though the test mock succeeds.
        """
        override_db.query.return_value.filter.return_value.first.return_value = (
            make_db_user()
        )
        token = "my-specific-refresh-token-abc123"

        client.post(REFRESH_URL, json={"refresh_token": token})

        mock_refresh.assert_called_once_with(token)

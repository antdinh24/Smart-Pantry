"""
test_routers_receipts_scan.py

PURPOSE:
    HTTP-level tests for POST /api/v1/receipts/scan — the new GPT-4o vision
    receipt scanning endpoint.

    These tests sit at the router layer (not the service layer), exercising
    the full request/response cycle including:
      - Auth header validation (403 without token)
      - Request body validation (422 for image_base64 too short)
      - Happy path: successful scan returns receipt_id + line_items + merchant + total
      - 429 when the user has hit their 8-scan monthly limit
      - 500 when GPT-4o fails (scan_image raises)
      - Usage counter is incremented on success
      - Usage counter is NOT incremented on failure

HOW THE DB IS MOCKED:
    FastAPI's dependency override system replaces get_db with a lambda that
    returns a Mock session. This is torn down after each test class.

    app.dependency_overrides[get_db] = lambda: mock_db

HOW SERVICES ARE MOCKED:
    The three services called inside the scan endpoint are patched:
      - UsageService.check_receipt_limit  → does nothing (passes) or raises 429
      - ReceiptScannerService.scan_image  → returns SAMPLE_OCR_TEXT
      - ReceiptParser.parse_receipt_text  → returns PARSED_RECEIPT_DATA
      - UsageService.increment_receipt_scans → tracked to verify increment timing

    The Receipt model's DB operations (db.add, db.commit, db.refresh) are
    all no-ops because mock_db's methods are Mocks. We configure db.refresh
    to set attributes on the receipt object so response serialization works.

IMPORTANT — RECEIPT OBJECT REFRESH:
    After db.commit() + db.refresh(receipt), the endpoint reads receipt.id
    to build the response. Since db.refresh is a no-op Mock, receipt.id
    (set as uuid.uuid4() before the commit) is already there — we just
    need to ensure db.refresh doesn't raise.
"""

import pytest
import uuid
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient
from fastapi import HTTPException, status

from app.main import app
from app.database import get_db

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

SCAN_URL = "/api/v1/receipts/scan"

# Minimum valid base64 string — the router enforces min_length=100
VALID_BASE64 = "a" * 200

# Sample OCR text that ReceiptScannerService would return
SAMPLE_OCR_TEXT = "WALMART\nMilk $3.99\nBread $2.50\nTOTAL $6.49"

# Sample structured data that ReceiptParser would return from the OCR text
PARSED_RECEIPT_DATA = {
    "merchant_name": "Walmart",
    "purchase_date": None,
    "total_amount": 6.49,
    "currency": "USD",
    "line_items": [
        {"item": "Milk", "price": 3.99, "quantity": 1, "category": "dairy"},
        {"item": "Bread", "price": 2.50, "quantity": 1, "category": "bakery"},
    ],
    "confidence": 0.92,
}


# ─────────────────────────────────────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db():
    """
    Mock SQLAlchemy session.
    db.refresh is configured as a no-op so it doesn't raise when called
    with the Receipt object.
    """
    db = Mock()
    db.refresh = Mock()
    db.add = Mock()
    db.commit = Mock()
    return db


@pytest.fixture
def override_db(mock_db):
    """
    Install the mock DB as the FastAPI dependency override for get_db,
    then tear it down after the test.
    """
    app.dependency_overrides[get_db] = lambda: mock_db
    yield mock_db
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: authentication
# ─────────────────────────────────────────────────────────────────────────────

class TestScanReceiptAuth:
    """Tests that the scan endpoint is protected by authentication."""

    def test_returns_403_without_auth_header(self, client, override_db):
        """Requests without a Bearer token should be rejected."""
        response = client.post(SCAN_URL, json={"image_base64": VALID_BASE64})
        assert response.status_code in (401, 403)

    def test_returns_403_with_empty_auth_header(self, client, override_db):
        """An empty Authorization header should be rejected."""
        response = client.post(
            SCAN_URL,
            json={"image_base64": VALID_BASE64},
            headers={"Authorization": ""},
        )
        assert response.status_code in (401, 403)


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: request validation
# ─────────────────────────────────────────────────────────────────────────────

class TestScanReceiptValidation:
    """Tests for request body validation before any service calls."""

    def test_returns_422_when_base64_too_short(self, client, override_db, auth_headers):
        """
        image_base64 must be at least 100 characters (min_length=100 on the
        Pydantic field). A real image is always longer. Short strings fail fast.
        """
        response = client.post(
            SCAN_URL,
            json={"image_base64": "tooshort"},
            headers=auth_headers,
        )
        assert response.status_code == 422

    def test_returns_422_when_base64_missing(self, client, override_db, auth_headers):
        """image_base64 is a required field — omitting it returns 422."""
        response = client.post(SCAN_URL, json={}, headers=auth_headers)
        assert response.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: success path
# ─────────────────────────────────────────────────────────────────────────────

class TestScanReceiptSuccess:
    """Tests for the successful scan flow."""

    @patch("app.routers.receipts.UsageService.increment_receipt_scans")
    @patch("app.routers.receipts.ReceiptParser.parse_receipt_text", return_value=PARSED_RECEIPT_DATA)
    @patch("app.routers.receipts.ReceiptScannerService.scan_image", return_value=SAMPLE_OCR_TEXT)
    @patch("app.routers.receipts.UsageService.check_receipt_limit")
    def test_returns_200_with_correct_shape(
        self,
        mock_check,
        mock_scan,
        mock_parse,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        A valid request with mocked services should return 200 with
        receipt_id, merchant_name, line_items, total_amount, and confidence.
        """
        response = client.post(
            SCAN_URL,
            json={"image_base64": VALID_BASE64},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "receipt_id" in data
        assert data["merchant_name"] == "Walmart"
        assert data["total_amount"] == 6.49
        assert len(data["line_items"]) == 2
        assert "confidence" in data

    @patch("app.routers.receipts.UsageService.increment_receipt_scans")
    @patch("app.routers.receipts.ReceiptParser.parse_receipt_text", return_value=PARSED_RECEIPT_DATA)
    @patch("app.routers.receipts.ReceiptScannerService.scan_image", return_value=SAMPLE_OCR_TEXT)
    @patch("app.routers.receipts.UsageService.check_receipt_limit")
    def test_increment_called_after_success(
        self,
        mock_check,
        mock_scan,
        mock_parse,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        The usage counter must be incremented exactly once after a successful
        scan. It must NOT be called before the scan (which would waste the user's
        quota even if GPT-4o fails).
        """
        client.post(
            SCAN_URL,
            json={"image_base64": VALID_BASE64},
            headers=auth_headers,
        )

        mock_increment.assert_called_once()

    @patch("app.routers.receipts.UsageService.increment_receipt_scans")
    @patch("app.routers.receipts.ReceiptParser.parse_receipt_text", return_value=PARSED_RECEIPT_DATA)
    @patch("app.routers.receipts.ReceiptScannerService.scan_image", return_value=SAMPLE_OCR_TEXT)
    @patch("app.routers.receipts.UsageService.check_receipt_limit")
    def test_receipt_id_is_valid_uuid(
        self,
        mock_check,
        mock_scan,
        mock_parse,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """The receipt_id in the response must be a valid UUID string."""
        response = client.post(
            SCAN_URL,
            json={"image_base64": VALID_BASE64},
            headers=auth_headers,
        )

        data = response.json()
        # This will raise ValueError if receipt_id is not a valid UUID
        uuid.UUID(data["receipt_id"])

    @patch("app.routers.receipts.UsageService.increment_receipt_scans")
    @patch("app.routers.receipts.ReceiptParser.parse_receipt_text", return_value=PARSED_RECEIPT_DATA)
    @patch("app.routers.receipts.ReceiptScannerService.scan_image", return_value=SAMPLE_OCR_TEXT)
    @patch("app.routers.receipts.UsageService.check_receipt_limit")
    def test_passes_base64_to_scan_image(
        self,
        mock_check,
        mock_scan,
        mock_parse,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        The image_base64 from the request body must be passed to
        ReceiptScannerService.scan_image unchanged — the router must not
        modify or truncate it.
        """
        custom_base64 = "b" * 300
        client.post(
            SCAN_URL,
            json={"image_base64": custom_base64},
            headers=auth_headers,
        )

        mock_scan.assert_called_once_with(custom_base64)


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: usage limit enforcement
# ─────────────────────────────────────────────────────────────────────────────

class TestScanReceiptUsageLimit:
    """Tests that the usage limit gate works correctly."""

    @patch("app.routers.receipts.UsageService.increment_receipt_scans")
    @patch("app.routers.receipts.ReceiptScannerService.scan_image")
    @patch("app.routers.receipts.UsageService.check_receipt_limit")
    def test_returns_429_when_limit_reached(
        self,
        mock_check,
        mock_scan,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        When check_receipt_limit raises HTTP 429, the endpoint must return
        429 to the client — not 500. The HTTPException must not be swallowed
        by the generic except block.
        """
        mock_check.side_effect = HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You've used all 8 free receipt scans for this month.",
        )

        response = client.post(
            SCAN_URL,
            json={"image_base64": VALID_BASE64},
            headers=auth_headers,
        )

        assert response.status_code == 429

    @patch("app.routers.receipts.UsageService.increment_receipt_scans")
    @patch("app.routers.receipts.ReceiptScannerService.scan_image")
    @patch("app.routers.receipts.UsageService.check_receipt_limit")
    def test_scan_image_not_called_when_limit_reached(
        self,
        mock_check,
        mock_scan,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        When the limit is hit, scan_image must NOT be called — the check
        must short-circuit before any expensive GPT-4o call is made.
        """
        mock_check.side_effect = HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Limit reached",
        )

        client.post(
            SCAN_URL,
            json={"image_base64": VALID_BASE64},
            headers=auth_headers,
        )

        mock_scan.assert_not_called()

    @patch("app.routers.receipts.UsageService.increment_receipt_scans")
    @patch("app.routers.receipts.ReceiptScannerService.scan_image")
    @patch("app.routers.receipts.UsageService.check_receipt_limit")
    def test_increment_not_called_when_limit_reached(
        self,
        mock_check,
        mock_scan,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        If the request is blocked by the limit, increment must not be called.
        Calling it would decrement the user's remaining quota for a scan
        that never happened.
        """
        mock_check.side_effect = HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Limit reached",
        )

        client.post(
            SCAN_URL,
            json={"image_base64": VALID_BASE64},
            headers=auth_headers,
        )

        mock_increment.assert_not_called()


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: GPT-4o failure
# ─────────────────────────────────────────────────────────────────────────────

class TestScanReceiptGptFailure:
    """Tests for what happens when GPT-4o itself fails."""

    @patch("app.routers.receipts.UsageService.increment_receipt_scans")
    @patch("app.routers.receipts.ReceiptScannerService.scan_image")
    @patch("app.routers.receipts.UsageService.check_receipt_limit")
    def test_returns_500_when_scan_image_raises(
        self,
        mock_check,
        mock_scan,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        If scan_image raises a generic Exception (e.g. OpenAI API down),
        the endpoint should return 500, not crash the server.
        """
        mock_scan.side_effect = Exception("GPT-4o service unavailable")

        response = client.post(
            SCAN_URL,
            json={"image_base64": VALID_BASE64},
            headers=auth_headers,
        )

        assert response.status_code == 500

    @patch("app.routers.receipts.UsageService.increment_receipt_scans")
    @patch("app.routers.receipts.ReceiptScannerService.scan_image")
    @patch("app.routers.receipts.UsageService.check_receipt_limit")
    def test_increment_not_called_when_scan_fails(
        self,
        mock_check,
        mock_scan,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        CRITICAL: if GPT-4o fails, the user's usage counter must NOT be
        incremented. A failed scan should not consume their monthly quota.

        This is the most important behavioral test for the usage system:
        we only charge usage after confirmed success.
        """
        mock_scan.side_effect = Exception("GPT-4o service unavailable")

        client.post(
            SCAN_URL,
            json={"image_base64": VALID_BASE64},
            headers=auth_headers,
        )

        mock_increment.assert_not_called()

    @patch("app.routers.receipts.UsageService.increment_receipt_scans")
    @patch("app.routers.receipts.ReceiptParser.parse_receipt_text")
    @patch("app.routers.receipts.ReceiptScannerService.scan_image", return_value=SAMPLE_OCR_TEXT)
    @patch("app.routers.receipts.UsageService.check_receipt_limit")
    def test_returns_400_when_parser_raises_value_error(
        self,
        mock_check,
        mock_scan,
        mock_parse,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        If ReceiptParser raises a ValueError (e.g. receipt text is unparseable),
        the endpoint should return 400 Bad Request, not 500.
        """
        mock_parse.side_effect = ValueError("Could not extract any items from receipt")

        response = client.post(
            SCAN_URL,
            json={"image_base64": VALID_BASE64},
            headers=auth_headers,
        )

        assert response.status_code == 400

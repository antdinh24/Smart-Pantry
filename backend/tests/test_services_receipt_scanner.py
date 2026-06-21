"""
test_services_receipt_scanner.py

PURPOSE:
    Unit tests for ReceiptScannerService — the service that sends a base64
    receipt image to GPT-4o vision and returns raw OCR text.

    These tests mock the OpenAI client entirely so no real API calls are made.
    We're verifying:
      1. The correct model, temperature, and max_tokens are used
      2. The image is wrapped in the expected data URL format before sending
      3. The extracted text from GPT-4o's response is returned correctly
      4. An empty/blank GPT-4o response raises a ValueError
      5. Any OpenAI API failure is re-raised as a generic Exception with context

WHY MOCK THE OPENAI CLIENT?
    ReceiptScannerService creates a new OpenAI() client inside scan_image().
    We patch 'app.services.receipt_scanner.OpenAI' to intercept that
    instantiation and return our mock client instead. This lets us control
    exactly what response.choices[0].message.content returns.

HOW THE MOCK CHAIN WORKS:
    The real call is:
        client = OpenAI(api_key=...)
        response = client.chat.completions.create(...)
        text = response.choices[0].message.content

    We mock it as:
        mock_client = Mock()
        mock_client.chat.completions.create.return_value = mock_response
        mock_response.choices[0].message.content = "WALMART\nMilk $3.99"
"""

import pytest
from unittest.mock import Mock, patch, MagicMock

from app.services.receipt_scanner import ReceiptScannerService


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

# A minimal valid base64 string (100+ chars required by the router, but the
# service itself doesn't validate length — that's the router's job).
SAMPLE_BASE64 = "a" * 200

SAMPLE_OCR_TEXT = (
    "WALMART\n"
    "123 Main St\n"
    "\n"
    "Milk        $3.99\n"
    "Bread       $2.50\n"
    "Eggs 12ct   $4.99\n"
    "\n"
    "TOTAL      $11.48\n"
)


def make_mock_openai_client(content: str):
    """
    Build a Mock that looks like an OpenAI client whose chat.completions.create()
    returns a response with the given content string.

    @param content - The text to put in response.choices[0].message.content
    @returns       - Mock object that can replace the OpenAI() instance
    """
    mock_message = Mock()
    mock_message.content = content

    mock_choice = Mock()
    mock_choice.message = mock_message

    mock_response = Mock()
    mock_response.choices = [mock_choice]

    mock_client = Mock()
    mock_client.chat.completions.create.return_value = mock_response

    return mock_client


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: scan_image — success path
# ─────────────────────────────────────────────────────────────────────────────

class TestScanImageSuccess:
    """Tests for the happy path of ReceiptScannerService.scan_image()"""

    def test_returns_extracted_text(self):
        """
        When GPT-4o returns text, scan_image should return it as a string.
        This is the primary output — the text goes on to ReceiptParser.
        """
        mock_client = make_mock_openai_client(SAMPLE_OCR_TEXT)

        with patch("app.services.receipt_scanner.OpenAI", return_value=mock_client):
            result = ReceiptScannerService.scan_image(SAMPLE_BASE64)

        assert result == SAMPLE_OCR_TEXT.strip()

    def test_strips_leading_trailing_whitespace(self):
        """
        GPT-4o sometimes returns text with leading/trailing newlines.
        scan_image should strip() the result before returning.
        """
        padded_text = "\n\n  " + SAMPLE_OCR_TEXT + "\n  \n"
        mock_client = make_mock_openai_client(padded_text)

        with patch("app.services.receipt_scanner.OpenAI", return_value=mock_client):
            result = ReceiptScannerService.scan_image(SAMPLE_BASE64)

        assert not result.startswith("\n")
        assert not result.endswith("\n")

    def test_uses_correct_model(self):
        """
        The model must be 'gpt-4o'. gpt-4-turbo does NOT support vision.
        If someone changes the model to save cost, this test will catch it.
        """
        mock_client = make_mock_openai_client(SAMPLE_OCR_TEXT)

        with patch("app.services.receipt_scanner.OpenAI", return_value=mock_client):
            ReceiptScannerService.scan_image(SAMPLE_BASE64)

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "gpt-4o"

    def test_uses_temperature_zero(self):
        """
        temperature=0 ensures deterministic OCR output. Creative variation
        is harmful here — we want exact transcription every time.
        """
        mock_client = make_mock_openai_client(SAMPLE_OCR_TEXT)

        with patch("app.services.receipt_scanner.OpenAI", return_value=mock_client):
            ReceiptScannerService.scan_image(SAMPLE_BASE64)

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["temperature"] == 0

    def test_uses_max_tokens_500(self):
        """
        max_tokens=500 caps cost and prevents runaway responses.
        A real grocery receipt is typically 100-300 tokens of text.
        """
        mock_client = make_mock_openai_client(SAMPLE_OCR_TEXT)

        with patch("app.services.receipt_scanner.OpenAI", return_value=mock_client):
            ReceiptScannerService.scan_image(SAMPLE_BASE64)

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["max_tokens"] == 500

    def test_image_is_sent_as_data_url(self):
        """
        GPT-4o vision requires images in "data:image/jpeg;base64,..." format.
        The frontend sends just the base64 string — the service must add the prefix.
        """
        mock_client = make_mock_openai_client(SAMPLE_OCR_TEXT)

        with patch("app.services.receipt_scanner.OpenAI", return_value=mock_client):
            ReceiptScannerService.scan_image(SAMPLE_BASE64)

        # Extract the messages from the call
        call_kwargs = mock_client.chat.completions.create.call_args[1]
        messages = call_kwargs["messages"]

        # Find the user message (index 1) and locate the image_url content block
        user_message = messages[1]
        image_blocks = [
            block for block in user_message["content"]
            if block.get("type") == "image_url"
        ]

        assert len(image_blocks) == 1
        sent_url = image_blocks[0]["image_url"]["url"]
        assert sent_url == f"data:image/jpeg;base64,{SAMPLE_BASE64}"

    def test_system_prompt_is_included(self):
        """
        The system prompt instructing GPT-4o to act as a pure OCR tool
        must be present as the first message.
        """
        mock_client = make_mock_openai_client(SAMPLE_OCR_TEXT)

        with patch("app.services.receipt_scanner.OpenAI", return_value=mock_client):
            ReceiptScannerService.scan_image(SAMPLE_BASE64)

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        messages = call_kwargs["messages"]
        system_message = messages[0]

        assert system_message["role"] == "system"
        assert len(system_message["content"]) > 0


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: scan_image — error paths
# ─────────────────────────────────────────────────────────────────────────────

class TestScanImageErrors:
    """Tests for failure cases in ReceiptScannerService.scan_image()"""

    def test_raises_when_response_is_empty_string(self):
        """
        GPT-4o returning an empty string means the image was unreadable.
        scan_image should raise an Exception (not return silently).
        """
        mock_client = make_mock_openai_client("")

        with patch("app.services.receipt_scanner.OpenAI", return_value=mock_client):
            with pytest.raises(Exception) as exc_info:
                ReceiptScannerService.scan_image(SAMPLE_BASE64)

        assert "empty" in str(exc_info.value).lower() or "unreadable" in str(exc_info.value).lower()

    def test_raises_when_response_is_only_whitespace(self):
        """
        A response of all whitespace (e.g. "   \n\n  ") is functionally empty
        and should be treated the same as an empty string.
        """
        mock_client = make_mock_openai_client("   \n\n   ")

        with patch("app.services.receipt_scanner.OpenAI", return_value=mock_client):
            with pytest.raises(Exception):
                ReceiptScannerService.scan_image(SAMPLE_BASE64)

    def test_raises_when_openai_api_fails(self):
        """
        If the OpenAI API call raises (e.g. network error, rate limit,
        invalid API key), scan_image should raise an Exception that
        wraps the original error with context.
        """
        mock_client = Mock()
        mock_client.chat.completions.create.side_effect = Exception("OpenAI API error: 503")

        with patch("app.services.receipt_scanner.OpenAI", return_value=mock_client):
            with pytest.raises(Exception) as exc_info:
                ReceiptScannerService.scan_image(SAMPLE_BASE64)

        # The error message should contain context about what failed
        assert "scan" in str(exc_info.value).lower() or "receipt" in str(exc_info.value).lower()

    def test_error_wraps_original_message(self):
        """
        The raised exception should include the original error message so
        operators can debug what actually went wrong with the OpenAI call.
        """
        original_error = "Connection timeout after 30s"
        mock_client = Mock()
        mock_client.chat.completions.create.side_effect = Exception(original_error)

        with patch("app.services.receipt_scanner.OpenAI", return_value=mock_client):
            with pytest.raises(Exception) as exc_info:
                ReceiptScannerService.scan_image(SAMPLE_BASE64)

        assert original_error in str(exc_info.value)

"""
receipt_scanner.py

PURPOSE:
    ReceiptScannerService extracts raw text from a receipt image using
    GPT-4o vision. The extracted text is then passed to the existing
    ReceiptParser to produce structured line items.

WHY GPT-4o VISION (Option A)?
    - No new libraries or native build required (works in Expo managed workflow)
    - GPT-4o handles messy real-world receipts better than regex-only OCR
    - OpenAI key is already server-side (no key exposure in the mobile app)
    - Same API client pattern as recipe generation (OpenAI SDK already installed)

COST:
    Each scan sends one image to GPT-4o vision.
    Cost per scan: ~$0.01–$0.03 depending on image size.
    Images are resized on the frontend before sending to reduce cost.
    Free tier is capped at 8 scans/month — see UsageService.

TWO-STEP PIPELINE:
    1. ReceiptScannerService.scan_image()  →  raw OCR text (this file)
    2. ReceiptParser.parse_receipt_text()  →  structured line items (existing)

WHY NOT HAVE GPT-4o RETURN STRUCTURED JSON DIRECTLY?
    The existing ReceiptParser is already well-tested and handles edge cases
    (merchant detection, date parsing, confidence scoring). Using it as step 2
    means receipt scanning gets all that logic for free, and improvements to
    ReceiptParser automatically benefit scanned receipts too.
"""

import base64
from openai import OpenAI
from app.config import get_settings

settings = get_settings()


class ReceiptScannerService:
    """
    Service for extracting text from receipt images using GPT-4o vision.
    """

    # GPT-4o is required here — gpt-4-turbo does not support vision.
    # gpt-4o-mini would be cheaper (~50% cost) but less accurate on
    # low-quality receipt photos. Switch to mini if cost becomes a concern.
    MODEL = "gpt-4o"

    # The system prompt instructs GPT-4o to act as a pure OCR tool.
    # We explicitly tell it NOT to summarize or interpret — just transcribe.
    # This ensures the output feeds cleanly into ReceiptParser's regex patterns.
    SYSTEM_PROMPT = (
        "You are an OCR tool. Your only job is to extract and return the exact "
        "text content from receipt images. Transcribe every line exactly as it "
        "appears, preserving the original layout. Do not summarize, interpret, "
        "add comments, or format the output. Return only the raw receipt text."
    )

    USER_PROMPT = (
        "Extract all text from this receipt image exactly as it appears. "
        "Include every line: store name, address, date, all items with prices, "
        "subtotal, tax, and total. Return only the raw text, nothing else."
    )

    @staticmethod
    def scan_image(image_base64: str) -> str:
        """
        Send a base64-encoded receipt image to GPT-4o vision and return
        the extracted text.

        The returned text is intended to be passed directly into
        ReceiptParser.parse_receipt_text() as the ocr_text argument.

        HOW THE IMAGE IS SENT:
            GPT-4o vision accepts images as base64 data URLs in the format:
            "data:image/jpeg;base64,<base64_string>"
            The frontend should send just the base64 content (without the
            data URL prefix) — this method adds the prefix before the API call.

        WHY NOT STORE THE IMAGE?
            Privacy. The image is used only for this API call and then discarded.
            No image data is persisted anywhere on the backend.

        @param image_base64 - Base64-encoded JPEG or PNG of the receipt.
                              Should NOT include the "data:image/..." prefix.
        @returns            - Raw text content extracted from the receipt image.
        @raises             - Exception if the OpenAI API call fails.
        """
        client = OpenAI(api_key=settings.openai_api_key)

        # Build the data URL that GPT-4o vision expects.
        # We assume JPEG since that's what expo-camera produces by default.
        # PNG would also work — GPT-4o accepts both.
        image_url = f"data:image/jpeg;base64,{image_base64}"

        try:
            response = client.chat.completions.create(
                model=ReceiptScannerService.MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": ReceiptScannerService.SYSTEM_PROMPT,
                    },
                    {
                        "role": "user",
                        "content": [
                            # The text part of the user message
                            {
                                "type": "text",
                                "text": ReceiptScannerService.USER_PROMPT,
                            },
                            # The image part — GPT-4o vision reads this
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": image_url,
                                    # "auto" lets GPT-4o choose the detail level.
                                    # "low" would be cheaper (~$0.005) but less
                                    # accurate for small receipt text.
                                    "detail": "auto",
                                },
                            },
                        ],
                    },
                ],
                # Receipt text is short — 500 tokens is enough for any receipt
                # and prevents runaway costs if something goes wrong.
                max_tokens=500,
                # Temperature 0 = deterministic output. We want exact transcription,
                # not creative variation.
                temperature=0,
            )

            extracted_text = response.choices[0].message.content

            if not extracted_text or not extracted_text.strip():
                raise ValueError("GPT-4o returned empty text — image may be unreadable.")

            return extracted_text.strip()

        except Exception as e:
            raise Exception(f"Receipt scan failed: {str(e)}")

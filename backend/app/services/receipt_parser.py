"""
Receipt Parser Service

This module provides functionality to parse OCR text from receipt images into
structured data (merchant, date, items, prices, total).

Why this exists:
- Convert messy OCR text into clean, structured data
- Extract line items and prices from receipts
- Validate OCR results (confidence scoring)
- Support multiple receipt formats from different merchants
- Tiered pattern matching for merchant detection (promoted → hardcoded → DB → fallback)

Parsing Challenges:
- OCR errors: "0" vs "O", "1" vs "I", extra spaces
- Inconsistent formats across merchants
- Multi-line items (item name on one line, price on next)
- Ambiguous dates (MM/DD/YYYY vs DD/MM/YYYY)
- Subtotal vs total confusion
"""

import re
from datetime import datetime
from typing import Dict, List, Optional
from sqlalchemy.orm import Session


class ReceiptParser:
    """
    Service class for parsing receipt OCR text into structured data.

    This class handles the complex task of extracting structured information
    from unstructured OCR text. It uses regex patterns and heuristics to
    identify receipt components.

    Tiered Merchant Detection (for reliability):
        Tier 1: Promoted DB patterns (verified_count >= 100)
        Tier 2: Hardcoded patterns (always available)
        Tier 3: All DB patterns (regional merchants)
        Tier 4: First line fallback (never fails)

    Methods:
        parse_receipt_text: Main entry point - parses full receipt
        extract_merchant_name: Tiered merchant detection
        extract_date: Finds purchase date using multiple patterns
        extract_line_items: Parses individual items and prices
        extract_total: Finds total amount from footer
        match_to_category: Auto-categorizes items by keywords
        calculate_confidence: Scores parsing quality (0.0-1.0)

    Example:
        >>> parser = ReceiptParser()
        >>> ocr_text = "WALMART\\n12/25/2024\\nMilk $3.99\\nTotal: $3.99"
        >>> result = parser.parse_receipt_text(ocr_text, db_session)
        >>> print(result)
        {
            "merchant_name": "Walmart",
            "purchase_date": "2024-12-25T00:00:00",
            "total_amount": 3.99,
            "line_items": [{"item": "Milk", "price": 3.99, "quantity": 1}],
            "confidence": 0.9
        }
    """

    # Hardcoded patterns (Tier 2 - always available, national chains only)
    # Small list for reliability - promoted DB patterns get checked first
    DEFAULT_MERCHANT_PATTERNS = [
        ('walmart', 'Walmart'),
        (r'whole\s*foods?', 'Whole Foods'),
        ('target', 'Target'),
        ('kroger', 'Kroger'),
        ('safeway', 'Safeway'),
        (r'trader\s*joe\'?s?', "Trader Joe's"),
        ('costco', 'Costco'),
        ('publix', 'Publix'),
        ('wegmans', 'Wegmans'),
        ('aldi', 'Aldi'),
    ]

    # Category keywords for auto-categorization
    CATEGORY_KEYWORDS = {
        'dairy': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'sour cream'],
        'produce': ['apple', 'banana', 'lettuce', 'tomato', 'onion', 'potato', 'carrot', 'broccoli', 'spinach'],
        'protein': ['chicken', 'beef', 'pork', 'fish', 'salmon', 'turkey', 'eggs', 'tofu'],
        'grains': ['bread', 'pasta', 'rice', 'cereal', 'oat', 'wheat', 'flour'],
        'condiments': ['sauce', 'ketchup', 'mayo', 'mustard', 'dressing', 'oil', 'vinegar'],
        'beverages': ['juice', 'soda', 'water', 'coffee', 'tea', 'beer', 'wine'],
        'snacks': ['chips', 'crackers', 'cookies', 'popcorn', 'candy', 'chocolate'],
    }

    @staticmethod
    def parse_receipt_text(ocr_text: str, db: Optional[Session] = None) -> Dict:
        """
        Parse OCR text from a receipt into structured data.

        This is the main entry point for receipt parsing. It extracts all
        relevant information from the OCR text including merchant, date,
        items, and total.

        Strategy:
            1. Clean and normalize the input text
            2. Extract merchant name (tiered: promoted DB → hardcoded → all DB → fallback)
            3. Extract purchase date using multiple date patterns
            4. Parse line items (items + prices)
            5. Extract total amount from footer
            6. Calculate confidence score based on data quality

        Args:
            ocr_text (str): Raw text from OCR engine (may contain errors and extra whitespace)
            db (Session, optional): Database session for querying merchant patterns

        Returns:
            dict: Structured receipt data containing:
                - merchant_name (str|None): Detected store name
                - purchase_date (datetime|None): Purchase date
                - total_amount (float): Receipt total
                - line_items (list): Array of dicts with:
                    - item (str): Item name
                    - price (float): Item price
                    - quantity (int): Quantity purchased
                    - category (str): Auto-detected category
                - confidence (float): Parsing confidence (0.0-1.0)

        Raises:
            ValueError: If OCR text is empty or None

        Note:
            - Confidence < 0.6 indicates low-quality OCR, user should review carefully
            - Missing merchant_name or purchase_date will lower confidence score
            - Line items may be incomplete if OCR quality is poor
        """
        if not ocr_text:
            raise ValueError("OCR text cannot be empty")

        lines = [line.strip() for line in ocr_text.split('\n') if line.strip()]

        merchant_name = ReceiptParser.extract_merchant_name(lines, db)
        purchase_date = ReceiptParser.extract_date(ocr_text)
        line_items = ReceiptParser.extract_line_items(lines)
        total_amount = ReceiptParser.extract_total(ocr_text, line_items)

        parsed_data = {
            "merchant_name": merchant_name,
            "purchase_date": purchase_date.isoformat() if purchase_date else None,
            "total_amount": float(total_amount),
            "line_items": line_items,
        }

        confidence = ReceiptParser.calculate_confidence(parsed_data)
        parsed_data["confidence"] = confidence

        return parsed_data

    @staticmethod
    def extract_merchant_name(lines: List[str], db: Optional[Session] = None) -> Optional[str]:
        """
        Extract merchant/store name from receipt header using tiered pattern matching.

        Tiered Matching Strategy (for maximum reliability):
            Tier 1: Promoted DB patterns (verified by 100+ users) - most accurate
            Tier 2: Hardcoded patterns (always available) - reliable fallback
            Tier 3: All DB patterns (regional merchants) - comprehensive coverage
            Tier 4: First line fallback (never fails) - ultimate fallback

        This ensures the system degrades gracefully:
        - If DB is down → uses hardcoded patterns
        - If no patterns match → uses first line
        - Popular user-learned patterns get priority

        Args:
            lines (list): List of cleaned text lines from OCR (header lines examined first)
            db (Session, optional): Database session for querying merchant patterns

        Returns:
            str|None: Detected merchant name (title-cased) or first line as fallback

        Example:
            >>> lines = ["WALMART", "123 Main St", "Phone: 555-1234"]
            >>> ReceiptParser.extract_merchant_name(lines, db_session)
            'Walmart'

            >>> lines = ["WHL FDS MKT", "Organic Food"]  # Regional variation
            >>> ReceiptParser.extract_merchant_name(lines, db_session)
            'Whole Foods'  # From promoted DB pattern (verified by users)
        """
        header_lines = lines[:5]  # Merchants typically in first 5 lines

        # Tier 1: Promoted database patterns (verified_count >= 100)
        if db:
            try:
                from app.models.merchant_pattern import MerchantPattern
                promoted_patterns = db.query(MerchantPattern).filter(
                    MerchantPattern.is_active == True,
                    MerchantPattern.verified_count >= 100
                ).order_by(MerchantPattern.verified_count.desc()).all()

                for pattern_obj in promoted_patterns:
                    for line in header_lines:
                        if re.search(pattern_obj.regex_pattern, line, re.IGNORECASE):
                            # Update usage tracking
                            pattern_obj.usage_count += 1
                            pattern_obj.last_used = datetime.now()
                            db.commit()
                            return pattern_obj.merchant_name
            except Exception as e:
                # DB error - fall through to hardcoded patterns
                pass

        # Tier 2: Hardcoded patterns (always available)
        for line in header_lines:
            line_lower = line.lower()
            # Also match space-collapsed version to handle OCR artifacts like "W A L M A R T"
            line_compact = re.sub(r'(?<=[a-z]) (?=[a-z])', '', line_lower)
            for pattern, merchant_name in ReceiptParser.DEFAULT_MERCHANT_PATTERNS:
                if re.search(pattern, line_lower) or re.search(pattern, line_compact):
                    return merchant_name

        # Tier 3: All database patterns (includes regional merchants)
        if db:
            try:
                from app.models.merchant_pattern import MerchantPattern
                all_patterns = db.query(MerchantPattern).filter(
                    MerchantPattern.is_active == True
                ).order_by(MerchantPattern.confidence_score.desc()).all()

                for pattern_obj in all_patterns:
                    for line in header_lines:
                        if re.search(pattern_obj.regex_pattern, line, re.IGNORECASE):
                            # Update usage tracking
                            pattern_obj.usage_count += 1
                            pattern_obj.last_used = datetime.now()
                            db.commit()
                            return pattern_obj.merchant_name
            except Exception as e:
                # DB error - fall through to fallback
                pass

        # Tier 4: Ultimate fallback (never fails)
        return lines[0] if lines else None

    @staticmethod
    def extract_date(text: str) -> Optional[datetime]:
        """
        Extract purchase date from receipt text using multiple date patterns.

        Tries several common date formats to handle different receipt layouts.
        Prefers MM/DD/YYYY format (common in US receipts).

        Patterns tried (in order):
            1. MM/DD/YYYY or MM-DD-YYYY (e.g., "12/25/2024")
            2. YYYY-MM-DD (e.g., "2024-12-25")
            3. Month DD, YYYY (e.g., "Dec 25, 2024")

        Args:
            text (str): Full OCR text from receipt

        Returns:
            datetime|None: Parsed date or None if no date found

        Note:
            - Validates dates are not in the future
            - Rejects dates more than 1 year old (likely OCR error)
            - Ambiguous dates (e.g., "05/06/2024") are interpreted as MM/DD/YYYY
        """
        date_patterns = [
            (r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', '%m/%d/%Y'),
            (r'(\d{4})[/-](\d{2})[/-](\d{2})', '%Y-%m-%d'),
            (r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})', '%b %d %Y'),
        ]

        for pattern, date_format in date_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    if date_format == '%m/%d/%Y':
                        month, day, year = match.groups()
                        date_obj = datetime.strptime(f"{month}/{day}/{year}", date_format)
                    elif date_format == '%Y-%m-%d':
                        year, month, day = match.groups()
                        date_obj = datetime.strptime(f"{year}-{month}-{day}", date_format)
                    else:
                        # Build date string from named groups to avoid comma ambiguity
                        # (regex allows optional comma: "Dec 25, 2024" or "Dec 25 2024")
                        month_str, day_str, year_str = match.groups()
                        date_obj = datetime.strptime(
                            f"{month_str} {int(day_str):02d} {year_str}", date_format
                        )

                    # Validate: not in future, not more than 1 year old
                    if date_obj <= datetime.now() and (datetime.now() - date_obj).days < 365:
                        return date_obj
                except ValueError:
                    continue

        return None

    @staticmethod
    def extract_line_items(lines: List[str]) -> List[Dict]:
        """
        Extract individual line items (products) and their prices from receipt.

        Strategy:
            1. Look for lines matching pattern: text followed by price
            2. Extract price (last decimal number on line)
            3. Extract item name (everything before price)
            4. Check for quantity patterns (e.g., "2 @ $3.99")
            5. Skip header/footer lines (total, subtotal, tax, etc.)

        Args:
            lines (list): List of cleaned text lines from OCR

        Returns:
            list: Array of item dictionaries:
                - item (str): Cleaned item name
                - price (float): Item price
                - quantity (int): Quantity (defaults to 1)
                - category (str): Auto-detected category

        Note:
            - Skips lines containing keywords: total, subtotal, tax, payment, change
            - Handles both "$3.99" and "3.99" price formats
            - Quantity pattern: "2 @" or "2 x" or "QTY 2"
        """
        items = []
        skip_keywords = ['total', 'subtotal', 'tax', 'payment', 'change', 'cash', 'credit', 'debit']

        for line in lines:
            if any(keyword in line.lower() for keyword in skip_keywords):
                continue

            # Look for price pattern: $XX.XX or XX.XX at end of line
            price_match = re.search(r'\$?(\d+\.\d{2})\s*$', line)
            if price_match:
                price = float(price_match.group(1))
                item_text = line[:price_match.start()].strip()

                # Check for quantity: "2 @ $0.59" or "QTY 2"
                quantity = 1
                qty_match = re.search(r'(\d+)\s*[@xX]', item_text) or re.search(r'QTY\s*(\d+)', item_text, re.IGNORECASE)
                if qty_match:
                    quantity = int(qty_match.group(1))
                    item_text = re.sub(r'\d+\s*[@xX]|\bQTY\s*\d+', '', item_text, flags=re.IGNORECASE).strip()
                    # Remove unit price left behind (e.g., "$0.59" in "Bananas $0.59" after qty strip)
                    item_text = re.sub(r'\$?\d+\.\d{2}', '', item_text).strip()

                item_name = re.sub(r'\s+', ' ', item_text).strip()

                if item_name:
                    category = ReceiptParser.match_to_category(item_name)
                    items.append({
                        "item": item_name,
                        "price": price,
                        "quantity": quantity,
                        "category": category,
                    })

        return items

    @staticmethod
    def extract_total(text: str, line_items: List[Dict]) -> float:
        """
        Extract total amount from receipt footer.

        Searches for keywords like "total", "amount due", "balance" followed by
        a price. Prefers "total" over "subtotal".

        Validation:
            - Total should be >= sum of line items
            - If total < sum, use sum instead (OCR error or total not found)

        Args:
            text (str): Full OCR text from receipt
            line_items (list): Already-parsed line items (for validation)

        Returns:
            float: Total amount (validated against line items)

        Note:
            - If multiple totals found, uses the highest value
            - Falls back to sum of line items if no total keyword found
            - "Subtotal" has lower priority than "Total"
        """
        total_keywords = [
            (r'total\s*:?\s*\$?(\d+\.\d{2})', 10),           # "TOTAL: $10.00" (highest priority)
            (r'amount\s*due\s*:?\s*\$?(\d+\.\d{2})', 9),     # "AMOUNT DUE: $10.00"
            (r'balance\s*:?\s*\$?(\d+\.\d{2})', 8),          # "BALANCE: $10.00"
            (r'subtotal\s*:?\s*\$?(\d+\.\d{2})', 5),         # "SUBTOTAL: $10.00" (lower priority)
        ]

        best_total = 0.0
        best_priority = 0

        for pattern, priority in total_keywords:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                total_value = float(matches[-1])  # Use last occurrence
                if priority > best_priority:
                    best_total = total_value
                    best_priority = priority

        # Validate against line items sum
        items_sum = sum(item['price'] * item['quantity'] for item in line_items)

        # If no total found or total < sum (likely OCR error), use sum
        if best_total == 0.0 or best_total < items_sum:
            return items_sum

        return best_total

    @staticmethod
    def match_to_category(item_name: str) -> str:
        """
        Auto-categorize an item based on keyword matching.

        Args:
            item_name (str): Item name (e.g., "Organic Milk", "Chicken Breast")

        Returns:
            str: Category name (dairy, produce, protein, grains, condiments,
                 beverages, snacks, or 'pantry' as fallback)

        Note:
            - Matching is case-insensitive
            - Returns 'pantry' as default category if no keywords match
        """
        item_lower = item_name.lower()

        for category, keywords in ReceiptParser.CATEGORY_KEYWORDS.items():
            if any(keyword in item_lower for keyword in keywords):
                return category

        return 'pantry'

    @staticmethod
    def calculate_confidence(parsed_data: Dict) -> float:
        """
        Calculate confidence score for parsed receipt data.

        Scoring breakdown:
            - Has merchant name: +0.2
            - Has purchase date: +0.2
            - Has line items: +0.3
            - Total matches sum of items (within $1.00): +0.3

        Args:
            parsed_data (dict): Parsed receipt data

        Returns:
            float: Confidence score between 0.0 and 1.0
                - 0.9-1.0: Excellent (all data present, total matches)
                - 0.7-0.9: Good (most data present)
                - 0.5-0.7: Fair (some data missing)
                - <0.5: Poor (significant data missing, user should review)

        Note:
            - Recommend user review if score < 0.6
        """
        score = 0.0

        if parsed_data.get('merchant_name'):
            score += 0.2

        if parsed_data.get('purchase_date'):
            score += 0.2

        if parsed_data.get('line_items') and len(parsed_data['line_items']) > 0:
            score += 0.3

        line_items = parsed_data.get('line_items', [])
        items_sum = sum(item['price'] * item['quantity'] for item in line_items)
        total = parsed_data.get('total_amount', 0)
        # Only award total-match bonus when items exist; 0 == 0 is a false positive
        if line_items and abs(items_sum - total) < 1.0:
            score += 0.3

        return min(score, 1.0)

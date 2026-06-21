"""
Unit Tests for Receipt Parser Service

Tests cover:
- Edge cases (empty input, None values, malformed data)
- Minimal input (bare minimum required data)
- Full context input (all fields populated)
- Ambiguous input (data that could be interpreted multiple ways)
- Error handling (exceptions, validation)
- Mock external dependencies (database)
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, MagicMock
from app.services.receipt_parser import ReceiptParser


class TestReceiptParserParseReceiptText:
    """Tests for parse_receipt_text() - main entry point"""

    def test_parse_empty_text_raises_error(self):
        """Edge case: Empty OCR text should raise ValueError"""
        with pytest.raises(ValueError, match="OCR text cannot be empty"):
            ReceiptParser.parse_receipt_text("")

        with pytest.raises(ValueError, match="OCR text cannot be empty"):
            ReceiptParser.parse_receipt_text(None)

    def test_parse_minimal_valid_receipt(self):
        """Minimal input: Simplest valid receipt (just total, no items)"""
        ocr_text = "TOTAL: $10.00"
        result = ReceiptParser.parse_receipt_text(ocr_text)

        assert result['total_amount'] == 10.00
        assert result['line_items'] == []
        assert isinstance(result['confidence'], float)
        assert 0.0 <= result['confidence'] <= 1.0

    def test_parse_full_context_receipt(self):
        """Full context: Complete receipt with all fields"""
        _d = datetime.now() - timedelta(days=30)
        recent_date = f"{_d.month}/{_d.day}/{_d.year}"
        ocr_text = f"""
        WALMART
        123 Main Street
        {recent_date}

        Milk $3.99
        Eggs $4.49
        Bread $2.99

        TOTAL: $11.47
        """
        result = ReceiptParser.parse_receipt_text(ocr_text)

        assert result['merchant_name'] == 'Walmart'
        assert result['purchase_date'] is not None
        assert result['total_amount'] == 11.47
        assert len(result['line_items']) == 3
        assert result['confidence'] > 0.8  # High confidence with all data

    def test_parse_receipt_without_merchant(self):
        """Edge case: Receipt with no recognizable merchant"""
        ocr_text = """
        UNKNOWN STORE
        01/15/2025
        Item 1 $5.00
        TOTAL: $5.00
        """
        result = ReceiptParser.parse_receipt_text(ocr_text)

        assert result['merchant_name'] == 'UNKNOWN STORE'  # Falls back to first line
        assert result['total_amount'] == 5.00

    def test_parse_receipt_without_date(self):
        """Edge case: Receipt with no parseable date"""
        ocr_text = """
        WALMART
        Invalid Date Text
        Item 1 $5.00
        TOTAL: $5.00
        """
        result = ReceiptParser.parse_receipt_text(ocr_text)

        assert result['merchant_name'] == 'Walmart'
        assert result['purchase_date'] is None
        assert result['confidence'] < 0.9  # Missing date lowers confidence (max possible = 0.8)

    def test_parse_receipt_with_ocr_errors(self):
        """Real-world: OCR errors (extra spaces, wrong characters)"""
        ocr_text = """
        W A L M A R T
        l2/25/2O24
        M i l k     $3.99
        TOTAL:  $ l l .47
        """
        result = ReceiptParser.parse_receipt_text(ocr_text)

        # Should still detect Walmart despite spacing
        assert result['merchant_name'] == 'Walmart'
        # Date parsing should fail (OCR errors: 'l' instead of '1', 'O' instead of '0')
        # Total should still parse if format is recognizable


class TestReceiptParserExtractMerchant:
    """Tests for extract_merchant_name() - tiered pattern matching"""

    def test_extract_merchant_from_exact_match(self):
        """Tier 2: Exact hardcoded pattern match"""
        lines = ["WALMART", "123 Main St"]
        result = ReceiptParser.extract_merchant_name(lines, db=None)
        assert result == 'Walmart'

    def test_extract_merchant_case_insensitive(self):
        """Edge case: Merchant name in different cases"""
        test_cases = [
            (["walmart", "123 Main St"], 'Walmart'),
            (["WALMART", "123 Main St"], 'Walmart'),
            (["WalMart", "123 Main St"], 'Walmart'),
        ]

        for lines, expected in test_cases:
            result = ReceiptParser.extract_merchant_name(lines, db=None)
            assert result == expected

    def test_extract_merchant_with_spacing_variations(self):
        """Edge case: Merchant with spacing variations"""
        test_cases = [
            (["WHOLE FOODS"], 'Whole Foods'),
            (["WHOLEFOODS"], 'Whole Foods'),
            (["WHOLE  FOODS"], 'Whole Foods'),  # Extra space
        ]

        for lines, expected in test_cases:
            result = ReceiptParser.extract_merchant_name(lines, db=None)
            assert result == expected

    def test_extract_merchant_fallback_to_first_line(self):
        """Tier 4: Fallback when no pattern matches"""
        lines = ["UNKNOWN LOCAL MARKET", "123 Street"]
        result = ReceiptParser.extract_merchant_name(lines, db=None)
        assert result == "UNKNOWN LOCAL MARKET"

    def test_extract_merchant_with_database_patterns(self):
        """Tier 1 & 3: Database pattern matching"""
        # Mock database session and promoted pattern
        mock_db = Mock()
        mock_pattern = Mock()
        mock_pattern.regex_pattern = r'h\s*e\s*b'
        mock_pattern.merchant_name = 'H-E-B'
        mock_pattern.verified_count = 150  # Promoted pattern
        mock_pattern.usage_count = 50

        mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [mock_pattern]

        lines = ["H E B", "123 Store St"]
        result = ReceiptParser.extract_merchant_name(lines, mock_db)

        assert result == 'H-E-B'
        assert mock_pattern.usage_count == 51  # Incremented

    def test_extract_merchant_db_error_falls_back_to_hardcoded(self):
        """Error handling: DB error should fallback to hardcoded patterns"""
        mock_db = Mock()
        mock_db.query.side_effect = Exception("Database error")

        lines = ["WALMART", "123 Main St"]
        result = ReceiptParser.extract_merchant_name(lines, mock_db)

        assert result == 'Walmart'  # Hardcoded fallback works


class TestReceiptParserExtractDate:
    """Tests for extract_date() - date pattern matching"""

    def test_extract_date_mm_dd_yyyy_format(self):
        """Standard US date format"""
        # Use a date within the 365-day acceptance window
        _d = datetime.now() - timedelta(days=30)
        text = f"Receipt Date: {_d.month}/{_d.day}/{_d.year}"
        result = ReceiptParser.extract_date(text)

        assert result is not None
        assert result.year == _d.year
        assert result.month == _d.month
        assert result.day == _d.day

    def test_extract_date_yyyy_mm_dd_format(self):
        """ISO date format"""
        _d = datetime.now() - timedelta(days=30)
        text = f"Date: {_d.year}-{_d.month:02d}-{_d.day:02d}"
        result = ReceiptParser.extract_date(text)

        assert result is not None
        assert result.year == _d.year
        assert result.month == _d.month
        assert result.day == _d.day

    def test_extract_date_month_name_format(self):
        """Month name format"""
        _d = datetime.now() - timedelta(days=30)
        text = _d.strftime("%b %d, %Y")
        result = ReceiptParser.extract_date(text)

        assert result is not None
        assert result.year == _d.year
        assert result.month == _d.month

    def test_extract_date_ambiguous_returns_mm_dd(self):
        """Ambiguous date should default to MM/DD/YYYY"""
        # Use current year to stay within the 365-day window
        year = datetime.now().year
        text = f"05/06/{year}"  # Could be May 6 or June 5
        result = ReceiptParser.extract_date(text)

        # Should interpret as MM/DD (May 6, not June 5)
        assert result is not None
        assert result.month == 5
        assert result.day == 6

    def test_extract_date_future_date_rejected(self):
        """Edge case: Future dates should be rejected (OCR error)"""
        future_year = datetime.now().year + 1
        text = f"Date: 01/01/{future_year}"
        result = ReceiptParser.extract_date(text)

        assert result is None

    def test_extract_date_too_old_rejected(self):
        """Edge case: Dates >1 year old rejected (likely OCR error)"""
        old_year = datetime.now().year - 2
        text = f"Date: 01/01/{old_year}"
        result = ReceiptParser.extract_date(text)

        assert result is None

    def test_extract_date_no_date_returns_none(self):
        """Edge case: No date in text"""
        text = "No dates here just random text"
        result = ReceiptParser.extract_date(text)

        assert result is None

    def test_extract_date_invalid_format_returns_none(self):
        """Edge case: Invalid date values"""
        test_cases = [
            "13/32/2024",  # Invalid month/day
            "00/00/2024",  # Zero month/day
            "99/99/9999",  # Unrealistic values
        ]

        for text in test_cases:
            result = ReceiptParser.extract_date(text)
            assert result is None


class TestReceiptParserExtractLineItems:
    """Tests for extract_line_items() - item and price parsing"""

    def test_extract_simple_line_items(self):
        """Standard format: Item name followed by price"""
        lines = [
            "Milk $3.99",
            "Eggs $4.49",
            "Bread $2.99"
        ]
        result = ReceiptParser.extract_line_items(lines)

        assert len(result) == 3
        assert result[0]['item'] == 'Milk'
        assert result[0]['price'] == 3.99
        assert result[0]['quantity'] == 1

    def test_extract_items_with_quantity(self):
        """Items with quantity notation (2 @ $3.99)"""
        lines = [
            "Bananas 2 @ $0.59 $1.18",
            "Apples 3 x $1.00 $3.00",
            "Oranges QTY 4 $0.99 $3.96"
        ]
        result = ReceiptParser.extract_line_items(lines)

        assert len(result) == 3
        assert result[0]['item'] == 'Bananas'
        assert result[0]['quantity'] == 2
        assert result[0]['price'] == 1.18

    def test_extract_items_skips_footer_lines(self):
        """Should skip lines with keywords: total, tax, subtotal"""
        lines = [
            "Milk $3.99",
            "SUBTOTAL: $3.99",
            "TAX: $0.32",
            "TOTAL: $4.31"
        ]
        result = ReceiptParser.extract_line_items(lines)

        assert len(result) == 1  # Only Milk
        assert result[0]['item'] == 'Milk'

    def test_extract_items_without_dollar_sign(self):
        """Edge case: Prices without $ symbol"""
        lines = [
            "Milk 3.99",
            "Eggs 4.49"
        ]
        result = ReceiptParser.extract_line_items(lines)

        assert len(result) == 2
        assert result[0]['price'] == 3.99

    def test_extract_items_with_extra_spaces(self):
        """Real-world: OCR adds extra spaces"""
        lines = [
            "M  i  l  k                 $3.99",
            "E g g s    $4.49"
        ]
        result = ReceiptParser.extract_line_items(lines)

        assert len(result) == 2
        assert 'i l k' in result[0]['item'] or 'M i l k' in result[0]['item']  # Spaces preserved in name

    def test_extract_items_empty_name_skipped(self):
        """Edge case: Lines with only price, no item name"""
        lines = [
            "$3.99",
            "   $4.49",
            ""
        ]
        result = ReceiptParser.extract_line_items(lines)

        assert len(result) == 0  # No valid items

    def test_extract_items_auto_categorizes(self):
        """Integration: Should auto-categorize items"""
        lines = [
            "Milk $3.99",
            "Chicken Breast $12.99",
            "Bananas $2.49"
        ]
        result = ReceiptParser.extract_line_items(lines)

        assert result[0]['category'] == 'dairy'
        assert result[1]['category'] == 'protein'
        assert result[2]['category'] == 'produce'


class TestReceiptParserExtractTotal:
    """Tests for extract_total() - total amount parsing"""

    def test_extract_total_from_keyword(self):
        """Standard: TOTAL keyword"""
        text = "TOTAL: $45.67"
        line_items = []
        result = ReceiptParser.extract_total(text, line_items)

        assert result == 45.67

    def test_extract_total_prefers_total_over_subtotal(self):
        """Should prefer TOTAL over SUBTOTAL"""
        text = """
        SUBTOTAL: $40.00
        TAX: $3.20
        TOTAL: $43.20
        """
        line_items = []
        result = ReceiptParser.extract_total(text, line_items)

        assert result == 43.20  # TOTAL, not SUBTOTAL

    def test_extract_total_validates_against_items(self):
        """Should validate total >= sum of items"""
        text = "TOTAL: $5.00"  # Total too low
        line_items = [
            {'price': 10.00, 'quantity': 1}  # Sum = 10.00
        ]
        result = ReceiptParser.extract_total(text, line_items)

        assert result == 10.00  # Uses sum, not parsed total

    def test_extract_total_fallback_to_item_sum(self):
        """Edge case: No total keyword, use sum of items"""
        text = "No total keyword here"
        line_items = [
            {'price': 3.99, 'quantity': 1},
            {'price': 4.49, 'quantity': 1}
        ]
        result = ReceiptParser.extract_total(text, line_items)

        assert result == 8.48  # Sum of items

    def test_extract_total_with_multiple_totals(self):
        """Ambiguous: Multiple total keywords"""
        text = """
        TOTAL ITEMS: 5
        SUBTOTAL: $40.00
        TOTAL: $43.20
        AMOUNT DUE: $43.20
        """
        line_items = []
        result = ReceiptParser.extract_total(text, line_items)

        # Should use highest priority keyword (TOTAL or AMOUNT DUE)
        assert result == 43.20


class TestReceiptParserMatchToCategory:
    """Tests for match_to_category() - auto-categorization"""

    def test_match_dairy_category(self):
        """Should detect dairy products"""
        test_cases = [
            ('Milk', 'dairy'),
            ('Whole Milk', 'dairy'),
            ('Cheese', 'dairy'),
            ('Yogurt', 'dairy'),
            ('Butter', 'dairy'),
        ]

        for item_name, expected_category in test_cases:
            result = ReceiptParser.match_to_category(item_name)
            assert result == expected_category

    def test_match_produce_category(self):
        """Should detect produce"""
        test_cases = [
            ('Bananas', 'produce'),
            ('Organic Apples', 'produce'),
            ('Tomatoes', 'produce'),
            ('Lettuce', 'produce'),
        ]

        for item_name, expected_category in test_cases:
            result = ReceiptParser.match_to_category(item_name)
            assert result == expected_category

    def test_match_case_insensitive(self):
        """Should match regardless of case"""
        test_cases = [
            'MILK',
            'milk',
            'MiLk',
        ]

        for item_name in test_cases:
            result = ReceiptParser.match_to_category(item_name)
            assert result == 'dairy'

    def test_match_unknown_item_returns_pantry(self):
        """Unknown items should default to 'pantry'"""
        result = ReceiptParser.match_to_category('Unknown Brand X Product')
        assert result == 'pantry'


class TestReceiptParserCalculateConfidence:
    """Tests for calculate_confidence() - confidence scoring"""

    def test_confidence_all_data_present(self):
        """High confidence when all data is present and valid"""
        parsed_data = {
            "merchant_name": "Walmart",
            "purchase_date": "2024-12-25T00:00:00",
            "total_amount": 8.48,
            "line_items": [
                {"item": "Milk", "price": 3.99, "quantity": 1},
                {"item": "Eggs", "price": 4.49, "quantity": 1}
            ]
        }
        result = ReceiptParser.calculate_confidence(parsed_data)

        assert result == 1.0  # Perfect score

    def test_confidence_missing_merchant(self):
        """Lower confidence without merchant"""
        parsed_data = {
            "merchant_name": None,
            "purchase_date": "2024-12-25T00:00:00",
            "total_amount": 8.48,
            "line_items": [{"item": "Milk", "price": 3.99, "quantity": 1}]
        }
        result = ReceiptParser.calculate_confidence(parsed_data)

        assert result <= 0.8  # Missing merchant = -0.2

    def test_confidence_missing_date(self):
        """Lower confidence without date"""
        parsed_data = {
            "merchant_name": "Walmart",
            "purchase_date": None,
            "total_amount": 8.48,
            "line_items": [{"item": "Milk", "price": 3.99, "quantity": 1}]
        }
        result = ReceiptParser.calculate_confidence(parsed_data)

        assert result <= 0.8  # Missing date = -0.2

    def test_confidence_no_items(self):
        """Low confidence with no line items"""
        parsed_data = {
            "merchant_name": "Walmart",
            "purchase_date": "2024-12-25T00:00:00",
            "total_amount": 0.0,
            "line_items": []
        }
        result = ReceiptParser.calculate_confidence(parsed_data)

        assert result <= 0.4  # Missing items = -0.3

    def test_confidence_total_mismatch(self):
        """Lower confidence when total doesn't match sum"""
        parsed_data = {
            "merchant_name": "Walmart",
            "purchase_date": "2024-12-25T00:00:00",
            "total_amount": 20.00,  # Doesn't match sum
            "line_items": [{"item": "Milk", "price": 3.99, "quantity": 1}]  # Sum = 3.99
        }
        result = ReceiptParser.calculate_confidence(parsed_data)

        assert result <= 0.7  # Total mismatch = -0.3

    def test_confidence_never_exceeds_one(self):
        """Confidence should be capped at 1.0"""
        # Even with perfect data, score shouldn't exceed 1.0
        parsed_data = {
            "merchant_name": "Walmart",
            "purchase_date": "2024-12-25T00:00:00",
            "total_amount": 3.99,
            "line_items": [{"item": "Milk", "price": 3.99, "quantity": 1}]
        }
        result = ReceiptParser.calculate_confidence(parsed_data)

        assert result <= 1.0
        assert result >= 0.0

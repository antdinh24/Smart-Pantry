"""
Barcode Lookup Service

Product Manager Note:
- Uses OpenFoodFacts API (free, open database)
- Looks up product info by barcode
- Returns product name, category, and other details
- No API key required!

OpenFoodFacts API Docs: https://wiki.openfoodfacts.org/API
"""

import requests
from typing import Optional, Dict


class BarcodeService:
    """Service for barcode lookup using OpenFoodFacts"""

    BASE_URL = "https://world.openfoodfacts.org/api/v0"

    @staticmethod
    def lookup(barcode: str) -> Optional[Dict]:
        """
        Look up product by barcode using OpenFoodFacts API.

        Product Manager Note:
        - Free API, no key required
        - Supports EAN-13, UPC-A, and other formats
        - Returns None if product not found
        - Database has 2M+ products

        Args:
            barcode: Product barcode (e.g., "8901234567890")

        Returns:
            Dict with product info, or None if not found

        Example Response:
            {
                "product_name": "Organic Whole Milk",
                "brands": "Horizon",
                "quantity": "1 gallon",
                "categories": "Dairy, Milk",
                "image_url": "https://...",
                "ingredients": "Organic Grade A Milk...",
                "nutriscore_grade": "b"
            }
        """
        try:
            # Call OpenFoodFacts API
            url = f"{BarcodeService.BASE_URL}/product/{barcode}.json"
            headers = {
                'User-Agent': 'SmartPantry/1.0'  # Required by OpenFoodFacts
            }

            response = requests.get(url, headers=headers, timeout=5)
            response.raise_for_status()

            data = response.json()

            # Check if product was found
            if data.get('status') != 1:
                return None

            product = data.get('product', {})

            # Extract relevant information
            return {
                "product_name": product.get('product_name') or product.get('product_name_en'),
                "brands": product.get('brands'),
                "quantity": product.get('quantity'),
                "categories": product.get('categories'),
                "image_url": product.get('image_url'),
                "ingredients_text": product.get('ingredients_text'),
                "nutriscore_grade": product.get('nutriscore_grade'),
                "serving_size": product.get('serving_size'),
                "packaging": product.get('packaging'),
                "barcode": barcode,
            }

        except requests.exceptions.Timeout:
            # API took too long
            return {"error": "Barcode lookup timed out"}

        except requests.exceptions.RequestException as e:
            # Network error or API error
            return {"error": f"Barcode lookup failed: {str(e)}"}

        except Exception as e:
            # Unexpected error
            return {"error": f"Unexpected error: {str(e)}"}

    @staticmethod
    def parse_quantity_unit(quantity_str: Optional[str]) -> Dict[str, Optional[str]]:
        """
        Parse quantity string into number and unit.

        Product Manager Note:
        - Extracts quantity and unit from OpenFoodFacts data
        - Examples: "1 gallon" → {quantity: "1", unit: "gallon"}
        - Handles various formats

        Args:
            quantity_str: Quantity string from OpenFoodFacts (e.g., "500g", "1 L")

        Returns:
            Dict with quantity and unit

        Examples:
            "500g" → {"quantity": "500", "unit": "g"}
            "1 gallon" → {"quantity": "1", "unit": "gallon"}
            "12 oz" → {"quantity": "12", "unit": "oz"}
        """
        if not quantity_str:
            return {"quantity": None, "unit": None}

        import re

        # Try to match number + unit pattern
        match = re.match(r'([\d.]+)\s*([a-zA-Z]+)', quantity_str.strip())

        if match:
            quantity = match.group(1)
            unit = match.group(2)

            # Normalize common units
            unit_map = {
                'g': 'g',
                'grams': 'g',
                'kg': 'kg',
                'l': 'L',
                'liters': 'L',
                'ml': 'mL',
                'oz': 'oz',
                'lb': 'lb',
                'lbs': 'lb',
            }

            unit = unit_map.get(unit.lower(), unit)

            return {"quantity": quantity, "unit": unit}

        # If no match, return original as quantity
        return {"quantity": quantity_str, "unit": None}

    @staticmethod
    def suggest_category(product_info: Dict) -> str:
        """
        Suggest pantry category based on OpenFoodFacts product info.

        Args:
            product_info: Product data from OpenFoodFacts

        Returns:
            Suggested category
        """
        categories = product_info.get('categories', '').lower()

        if 'dairy' in categories or 'milk' in categories or 'cheese' in categories:
            return 'dairy'
        elif 'meat' in categories or 'poultry' in categories or 'fish' in categories:
            return 'protein'
        elif 'vegetable' in categories or 'fruit' in categories:
            return 'produce'
        elif 'bread' in categories or 'pasta' in categories or 'grain' in categories:
            return 'grains'
        elif 'sauce' in categories or 'condiment' in categories:
            return 'condiments'
        else:
            return 'pantry'

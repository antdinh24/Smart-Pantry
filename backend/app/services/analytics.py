"""
Analytics Service

This module manages monthly analytics for user spending tracking.

Why this exists:
- Track monthly grocery spending (budget awareness)
- Identify top purchased ingredients (shopping patterns)
- Privacy-focused: aggregated data only, no receipt images
- Support budget insights and reports

Product Manager Note:
- Updates in real-time when receipts are confirmed
- Stores only top 10 ingredients per month (space-efficient)
- No raw receipt data stored (privacy compliance)
"""

from sqlalchemy.orm import Session
from datetime import datetime
from typing import Dict, List
from app.models.monthly_analytics import MonthlyAnalytics


class AnalyticsService:
    """
    Service class for managing monthly analytics data.

    This class handles real-time analytics updates when users process receipts.
    It maintains aggregated spending data without storing raw receipt information.

    Methods:
        update_monthly_analytics: Update analytics when receipt is confirmed
        get_monthly_summary: Get analytics for a specific month
        get_year_summary: Get all months for a year
        merge_top_ingredients: Combine existing and new ingredients (internal)

    Privacy Design:
        - Only stores monthly totals and top 10 ingredients
        - No individual receipt data retained
        - User-specific data (RLS enforced)

    Example:
        >>> service = AnalyticsService()
        >>> receipt_data = {
        ...     "total_amount": 45.67,
        ...     "purchase_date": "2025-01-15",
        ...     "line_items": [
        ...         {"item": "Milk", "price": 3.99, "quantity": 1},
        ...         {"item": "Eggs", "price": 4.49, "quantity": 1}
        ...     ]
        ... }
        >>> service.update_monthly_analytics(db, user_id, receipt_data)
    """

    @staticmethod
    def update_monthly_analytics(db: Session, user_id: str, receipt_data: Dict):
        """
        Update monthly analytics when a receipt is confirmed.

        This method is called after user confirms receipt items are correct.
        It updates the monthly totals and top ingredients list.

        Strategy:
            1. Extract month from receipt date (YYYY-MM format)
            2. Get or create MonthlyAnalytics record for that month
            3. Add receipt total to monthly spending
            4. Merge receipt items into top ingredients list
            5. Keep only top 10 ingredients (sorted by count)

        Args:
            db (Session): Database session
            user_id (str): User UUID
            receipt_data (dict): Parsed receipt data containing:
                - purchase_date (str): ISO format date
                - total_amount (float): Receipt total
                - line_items (list): Array of items with:
                    - item (str): Item name
                    - price (float): Item price
                    - quantity (int): Quantity purchased

        Example:
            >>> receipt = {
            ...     "purchase_date": "2025-01-15T14:30:00",
            ...     "total_amount": 45.67,
            ...     "line_items": [
            ...         {"item": "Milk", "price": 3.99, "quantity": 2},
            ...         {"item": "Eggs", "price": 4.49, "quantity": 1}
            ...     ]
            ... }
            >>> AnalyticsService.update_monthly_analytics(db, "user-uuid", receipt)

        Note:
            - Creates new monthly record if first receipt of the month
            - Automatically limits to top 10 ingredients (prevents data bloat)
            - Thread-safe (uses database transactions)
        """
        # Extract month from purchase date
        if isinstance(receipt_data.get('purchase_date'), str):
            purchase_date = datetime.fromisoformat(receipt_data['purchase_date'].replace('Z', '+00:00'))
        else:
            purchase_date = receipt_data.get('purchase_date') or datetime.now()

        month = purchase_date.strftime('%Y-%m')  # Format: "2025-01"

        # Get or create monthly analytics record
        analytics = db.query(MonthlyAnalytics).filter_by(
            user_id=user_id,
            month=month
        ).first()

        if not analytics:
            analytics = MonthlyAnalytics(
                user_id=user_id,
                month=month,
                total_spending=0,
                currency=receipt_data.get('currency', 'USD'),
                top_ingredients=[]
            )
            db.add(analytics)

        # Update total spending
        receipt_total = float(receipt_data.get('total_amount', 0))
        analytics.total_spending = float(analytics.total_spending or 0) + receipt_total

        # Update top ingredients
        current_top = analytics.top_ingredients or []
        new_items = receipt_data.get('line_items', [])

        updated_top = AnalyticsService.merge_top_ingredients(current_top, new_items)
        analytics.top_ingredients = updated_top

        # Update timestamp
        analytics.last_updated = datetime.now()

        db.commit()

    @staticmethod
    def get_monthly_summary(db: Session, user_id: str, month: str) -> Dict:
        """
        Get analytics summary for a specific month.

        Args:
            db (Session): Database session
            user_id (str): User UUID
            month (str): Month in YYYY-MM format (e.g., "2025-01")

        Returns:
            dict: Monthly analytics data:
                - month (str): Month identifier
                - total_spending (float): Total spent this month
                - currency (str): Currency code
                - top_ingredients (list): Top 10 ingredients with counts

        Example:
            >>> summary = AnalyticsService.get_monthly_summary(db, "user-uuid", "2025-01")
            >>> print(summary['total_spending'])
            542.73
            >>> print(summary['top_ingredients'][0])
            {"name": "Milk", "count": 5, "total_spent": 19.95}

        Note:
            - Returns empty data if no receipts for that month
            - top_ingredients sorted by count DESC (most purchased first)
        """
        analytics = db.query(MonthlyAnalytics).filter_by(
            user_id=user_id,
            month=month
        ).first()

        if not analytics:
            return {
                "month": month,
                "total_spending": 0.0,
                "currency": "USD",
                "top_ingredients": []
            }

        return analytics.to_dict()

    @staticmethod
    def get_year_summary(db: Session, user_id: str, year: int) -> List[Dict]:
        """
        Get analytics for all months in a year.

        Useful for year-end reports and spending trends visualization.

        Args:
            db (Session): Database session
            user_id (str): User UUID
            year (int): Year (e.g., 2025)

        Returns:
            list: Array of monthly analytics (up to 12 months):
                Each entry contains same fields as get_monthly_summary()

        Example:
            >>> summaries = AnalyticsService.get_year_summary(db, "user-uuid", 2025)
            >>> print(len(summaries))  # Number of months with data
            3
            >>> print(summaries[0]['month'])
            '2025-01'

        Note:
            - Only returns months with data (not all 12 months)
            - Results ordered by month ASC
            - Useful for charts and trend analysis
        """
        # Query all months for the year (YYYY-MM pattern)
        year_pattern = f"{year}-%"

        analytics_records = db.query(MonthlyAnalytics).filter(
            MonthlyAnalytics.user_id == user_id,
            MonthlyAnalytics.month.like(year_pattern)
        ).order_by(MonthlyAnalytics.month.asc()).all()

        return [record.to_dict() for record in analytics_records]

    @staticmethod
    def merge_top_ingredients(current_top: List[Dict], new_items: List[Dict]) -> List[Dict]:
        """
        Merge new receipt items into top ingredients list.

        This method combines existing top ingredients with new items from a receipt,
        updates counts, and keeps only the top 10.

        Strategy:
            1. Convert current top ingredients to dict for fast lookup
            2. Add new items (increment count if exists, add if new)
            3. Sort by count DESC
            4. Return top 10

        Args:
            current_top (list): Existing top ingredients:
                [{"name": "Milk", "count": 5, "total_spent": 19.95}, ...]
            new_items (list): New items from receipt:
                [{"item": "Milk", "price": 3.99, "quantity": 2}, ...]

        Returns:
            list: Updated top 10 ingredients sorted by count:
                [{"name": "...", "count": ..., "total_spent": ...}, ...]

        Example:
            >>> current = [{"name": "Milk", "count": 3, "total_spent": 11.97}]
            >>> new = [{"item": "Milk", "price": 3.99, "quantity": 2}]
            >>> merged = AnalyticsService.merge_top_ingredients(current, new)
            >>> print(merged[0])
            {"name": "Milk", "count": 5, "total_spent": 19.95}

        Note:
            - Keeps only top 10 to prevent data bloat
            - Normalizes item names (lowercase) for matching
            - Calculates total_spent = price * quantity
        """
        # Convert to dict for fast lookup (keyed by normalized name)
        ingredient_map = {
            item['name'].lower(): item
            for item in current_top
        }

        # Merge new items
        for item in new_items:
            name = item.get('item', '').strip()
            if not name:
                continue

            name_key = name.lower()
            price = float(item.get('price', 0))
            quantity = int(item.get('quantity', 1))
            item_total = price * quantity

            if name_key in ingredient_map:
                # Update existing ingredient
                ingredient_map[name_key]['count'] += quantity
                ingredient_map[name_key]['total_spent'] += item_total
            else:
                # Add new ingredient
                ingredient_map[name_key] = {
                    'name': name,  # Preserve original casing
                    'count': quantity,
                    'total_spent': item_total
                }

        # Sort by count DESC and return top 10
        sorted_ingredients = sorted(
            ingredient_map.values(),
            key=lambda x: x['count'],
            reverse=True
        )

        return sorted_ingredients[:10]

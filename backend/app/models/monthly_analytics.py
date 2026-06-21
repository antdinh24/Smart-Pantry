"""
Monthly Analytics Model

This module defines the MonthlyAnalytics model for tracking user spending data.

Why this exists:
- Track monthly grocery spending (budget awareness)
- Identify top purchased ingredients (shopping patterns)
- Privacy-focused: NO receipt images, only aggregated data
- Supports budget tracking features

Product Manager Note:
- Stores ONLY monthly totals and top 10 ingredients
- Does NOT store individual receipt data or images
- Privacy-compliant analytics
- One record per user per month
"""

from sqlalchemy import Column, String, DECIMAL, DateTime, UUID as SQLUUID
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.database import Base
import uuid


class MonthlyAnalytics(Base):
    """
    SQLAlchemy model for the monthly_analytics table.

    This model stores aggregated monthly spending data for each user.
    It's privacy-focused and doesn't store individual receipts or images.

    Attributes:
        id (UUID): Primary key, auto-generated UUID
        user_id (UUID): Foreign key to auth.users (which user this belongs to)
        month (str): Month in "YYYY-MM" format (e.g., "2025-01")
        total_spending (Decimal): Total amount spent this month
        currency (str): Currency code (defaults to "USD")
        top_ingredients (dict): JSON array of top 10 most purchased ingredients
                               Format: [{"name": "milk", "count": 5, "total_spent": 15.99}]
        created_at (datetime): When this record was created
        last_updated (datetime): Last time this record was updated

    Database Constraints:
        - Unique constraint on (user_id, month) - one record per user per month
        - Row Level Security (RLS) enabled - users can only see their own data

    Why we track monthly analytics:
        - Help users understand spending patterns
        - Identify frequently purchased items
        - Support budget tracking features
        - Privacy-compliant (no raw receipt data)
    """

    __tablename__ = "monthly_analytics"

    # Primary key
    id = Column(SQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # User reference (which user does this data belong to?)
    user_id = Column(SQLUUID(as_uuid=True), nullable=False, index=True)

    # Month identifier in YYYY-MM format (e.g., "2025-01")
    # String format allows for easy sorting and comparison
    month = Column(String, nullable=False)

    # Financial data
    total_spending = Column(DECIMAL(10, 2), default=0)  # Total spent this month
    currency = Column(String, default='USD')  # Currency code (ISO 4217)

    # Top ingredients purchased this month
    # Format: [{"name": "milk", "count": 5, "total_spent": 15.99}, ...]
    # Only stores top 10 to keep data size manageable
    top_ingredients = Column(JSONB)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_updated = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        """
        Convert the MonthlyAnalytics object to a dictionary for JSON serialization.

        This method is used when returning analytics data via API endpoints.
        It converts SQLAlchemy model objects into plain Python dictionaries
        that can be serialized to JSON.

        Args:
            None (uses self)

        Returns:
            dict: A dictionary containing all monthly analytics fields:
                - id (str): UUID as string
                - user_id (str): User UUID as string
                - month (str): Month in "YYYY-MM" format
                - total_spending (float): Total spent this month
                - currency (str): Currency code (e.g., "USD")
                - top_ingredients (list): Array of top 10 ingredients with:
                    - name (str): Ingredient name
                    - count (int): Number of times purchased
                    - total_spent (float): Total spent on this ingredient
                - created_at (str): ISO format timestamp
                - last_updated (str): ISO format timestamp

        Example:
            >>> analytics = MonthlyAnalytics(
            ...     user_id=uuid.uuid4(),
            ...     month="2025-01",
            ...     total_spending=542.73,
            ...     top_ingredients=[
            ...         {"name": "milk", "count": 5, "total_spent": 19.95},
            ...         {"name": "chicken breast", "count": 3, "total_spent": 35.97}
            ...     ]
            ... )
            >>> analytics.to_dict()
            {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "user_id": "987f6543-e21c-34b5-d678-123456789abc",
                "month": "2025-01",
                "total_spending": 542.73,
                "currency": "USD",
                "top_ingredients": [
                    {"name": "milk", "count": 5, "total_spent": 19.95},
                    {"name": "chicken breast", "count": 3, "total_spent": 35.97}
                ],
                "created_at": "2025-01-01T00:00:00+00:00",
                "last_updated": "2025-01-15T14:30:00+00:00"
            }

        Note:
            - Decimal values are converted to float for JSON serialization
            - UUIDs are converted to strings
            - Datetime objects are converted to ISO 8601 format strings
        """
        return {
            "id": str(self.id),  # Convert UUID to string for JSON
            "user_id": str(self.user_id),  # Convert UUID to string
            "month": self.month,
            "total_spending": float(self.total_spending) if self.total_spending else 0,  # Convert Decimal to float
            "currency": self.currency,
            "top_ingredients": self.top_ingredients,  # Already JSON-compatible
            "created_at": self.created_at.isoformat() if self.created_at else None,  # Convert to ISO 8601 string
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
        }

"""
Receipt Model

This module defines the Receipt model for storing parsed receipt data.

Why this exists:
- Store receipt data from OCR scanning (NO images)
- Track purchases for monthly analytics
- Allow users to review and verify scanned receipts
- Privacy-focused: only stores extracted text data, not images

Product Manager Note:
- Stores parsed receipt data
- NO images stored (privacy requirement - removed image_url column in migration 009)
- Used to update monthly analytics
- Processed flag tracks if items have been added to pantry
"""

from sqlalchemy import Column, String, DECIMAL, DateTime, Boolean, UUID as SQLUUID, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.database import Base
import uuid


class Receipt(Base):
    """
    SQLAlchemy model for the receipts table.

    This model represents receipt data extracted from OCR scanning.
    It stores structured data from receipts WITHOUT storing the actual images.

    Attributes:
        id (UUID): Primary key, auto-generated UUID
        user_id (UUID): Foreign key to auth.users (which user scanned this)
        merchant_name (str, optional): Store name (e.g., "Walmart", "Whole Foods")
        purchase_date (datetime): When the purchase was made
        total_amount (Decimal): Total amount on the receipt
        currency (str): Currency code (defaults to "USD")
        line_items (dict): JSON array of purchased items
                          Format: [{"item": "milk", "price": 3.99, "quantity": 1}]
        ocr_confidence (Decimal, optional): OCR accuracy score (0.0 to 1.0)
                                           Higher = more confident in extraction
        processed (bool): Whether items have been added to pantry (defaults to False)
        notes (str, optional): User notes about this receipt
        created_at (datetime): When this receipt was scanned

    Database Constraints:
        - purchase_date indexed for date range queries (monthly reports)
        - processed indexed for finding unprocessed receipts
        - Row Level Security (RLS) enabled - users can only see their own receipts

    Why we store receipts this way:
        - Privacy: No images stored, only extracted text data
        - Budget tracking: Used to update monthly_analytics table
        - Verification: Users can review OCR results before confirming
        - Analytics: Processed flag prevents double-counting in budgets
    """

    __tablename__ = "receipts"

    id = Column(SQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(SQLUUID(as_uuid=True), nullable=False, index=True)
    merchant_name = Column(String, nullable=True)
    purchase_date = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    total_amount = Column(DECIMAL(10, 2), nullable=False)
    currency = Column(String, default='USD')
    line_items = Column(JSONB)  # Format: [{"item": "milk", "price": 3.99, "quantity": 1}]
    ocr_confidence = Column(DECIMAL(3, 2), nullable=True)  # Range: 0.0 (low confidence) to 1.0 (high confidence)
    processed = Column(Boolean, default=False, index=True)  # False = pending confirmation, True = added to pantry
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        """
        Convert the Receipt object to a dictionary for JSON serialization.

        This method is used when returning receipt data via API endpoints.
        It converts SQLAlchemy model objects into plain Python dictionaries
        that can be serialized to JSON.

        Args:
            None (uses self)

        Returns:
            dict: A dictionary containing all receipt fields:
                - id (str): UUID as string
                - user_id (str): User UUID as string
                - merchant_name (str|None): Store name
                - purchase_date (str|None): ISO format timestamp
                - total_amount (float): Receipt total
                - currency (str): Currency code (e.g., "USD")
                - line_items (list|None): Array of purchased items
                - ocr_confidence (float|None): Confidence score (0.0-1.0)
                - processed (bool): Whether added to pantry
                - notes (str|None): User notes
                - created_at (str|None): ISO format timestamp

        Example:
            >>> receipt = Receipt(
            ...     user_id=uuid.uuid4(),
            ...     merchant_name="Walmart",
            ...     total_amount=45.67,
            ...     line_items=[
            ...         {"item": "Milk", "price": 3.99, "quantity": 1},
            ...         {"item": "Eggs", "price": 4.49, "quantity": 1}
            ...     ],
            ...     ocr_confidence=0.95
            ... )
            >>> receipt.to_dict()
            {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "user_id": "987f6543-e21c-34b5-d678-123456789abc",
                "merchant_name": "Walmart",
                "purchase_date": "2025-01-15T14:30:00+00:00",
                "total_amount": 45.67,
                "currency": "USD",
                "line_items": [
                    {"item": "Milk", "price": 3.99, "quantity": 1},
                    {"item": "Eggs", "price": 4.49, "quantity": 1}
                ],
                "ocr_confidence": 0.95,
                "processed": False,
                "notes": None,
                "created_at": "2025-01-15T14:30:00+00:00"
            }

        Note:
            - Decimal values are converted to float for JSON serialization
            - UUIDs are converted to strings
            - Datetime objects are converted to ISO 8601 format strings
            - None values are preserved (not converted to empty strings)
        """
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "merchant_name": self.merchant_name,
            "purchase_date": self.purchase_date.isoformat() if self.purchase_date else None,
            "total_amount": float(self.total_amount) if self.total_amount else 0,
            "currency": self.currency,
            "line_items": self.line_items,
            "ocr_confidence": float(self.ocr_confidence) if self.ocr_confidence else None,
            "processed": self.processed,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

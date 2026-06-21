"""
Pantry Item Model

Product Manager Note:
- Represents items in user's pantry/fridge/freezer
- Tracks quantity, expiration, location
- Used for recipe matching
"""

from sqlalchemy import Column, String, Float, Date, DateTime, Boolean, UUID
from sqlalchemy.sql import func
from app.database import Base
import uuid


class PantryItem(Base):
    """
    Pantry item model.

    Matches the schema in migrations/005_create_pantry_items_table.sql
    """

    __tablename__ = "pantry_items"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # User reference
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    # Ingredient information
    ingredient_name = Column(String, nullable=False)
    normalized_name = Column(String, index=True)  # Lowercase, singular form

    # Quantity
    quantity = Column(Float, nullable=False, default=1.0)
    unit = Column(String, nullable=True)  # "cups", "grams", "count", etc.

    # Categorization
    category = Column(String, index=True)  # "produce", "dairy", "meat", etc.
    location = Column(String)  # "fridge", "pantry", "freezer"

    # Tracking
    barcode = Column(String, nullable=True)
    expiration_date = Column(Date, nullable=True, index=True)

    # Timestamps
    added_date = Column(DateTime(timezone=True), server_default=func.now())
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Soft delete
    deleted = Column(Boolean, default=False, index=True)

    def __repr__(self):
        return f"<PantryItem {self.ingredient_name} ({self.quantity} {self.unit})>"

    def to_dict(self):
        """Convert pantry item to dictionary for API responses"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "ingredient_name": self.ingredient_name,
            "normalized_name": self.normalized_name,
            "quantity": self.quantity,
            "unit": self.unit,
            "category": self.category,
            "location": self.location,
            "barcode": self.barcode,
            "expiration_date": self.expiration_date.isoformat() if self.expiration_date else None,
            "added_date": self.added_date.isoformat() if self.added_date else None,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
            "deleted": self.deleted,
        }

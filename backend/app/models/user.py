"""
User Model

Product Manager Note:
- Represents a user account in the database
- Links to Supabase Auth via user_id
- Tracks subscription status for feature gating
"""

from sqlalchemy import Column, String, DateTime, UUID
from sqlalchemy.sql import func
from app.database import Base
import uuid


class User(Base):
    """
    User account model.

    Matches the schema in migrations/001_create_users_table.sql
    """

    __tablename__ = "users"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Link to Supabase Auth
    user_id = Column(UUID(as_uuid=True), unique=True, nullable=False, index=True)

    # User information
    email = Column(String, unique=True, nullable=False)

    # Subscription information
    subscription_status = Column(
        String,
        default="free",
        nullable=False,
    )
    subscription_end_date = Column(DateTime(timezone=True), nullable=True)
    stripe_customer_id = Column(String, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<User {self.email}>"

    def to_dict(self):
        """Convert user to dictionary for API responses"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "email": self.email,
            "subscription_status": self.subscription_status,
            "subscription_end_date": self.subscription_end_date.isoformat() if self.subscription_end_date else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

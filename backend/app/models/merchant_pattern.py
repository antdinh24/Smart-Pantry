"""
Merchant Pattern Model

This module defines the MerchantPattern model for storing merchant detection patterns.

Why this exists:
- Support tiered pattern matching for merchant detection
- Enable runtime pattern updates without code deployment
- Track pattern usage and verification
- Prepare for user-contributed learning (Phase 2)

Product Manager Note:
- Shared across all users (no RLS)
- Seeded with default patterns from migration 010
- Patterns with verified_count >= 100 are "promoted" (checked first)
"""

from sqlalchemy import Column, String, Integer, Boolean, DateTime, DECIMAL, UUID as SQLUUID, JSONB
from sqlalchemy.sql import func
from app.database import Base
import uuid


class MerchantPattern(Base):
    """
    SQLAlchemy model for the merchant_patterns table.

    This model stores regex patterns for detecting merchants from receipt OCR text.
    Patterns are shared across all users and support tiered matching for reliability.

    Attributes:
        id (UUID): Primary key, auto-generated UUID
        merchant_name (str): Normalized merchant name (e.g., "Whole Foods")
        regex_pattern (str): Regex pattern for matching (e.g., r'whole\s*foods?')
        raw_variants (list): JSON array of OCR variations seen (e.g., ["WHOLE FOODS", "WHL FDS"])
        usage_count (int): How many times this pattern matched (analytics)
        verified_count (int): How many times users confirmed this pattern (Phase 2)
        created_by (str): Pattern source ('system', 'user_learning', or 'admin')
        confidence_score (Decimal): Pattern confidence (0.0 to 1.0)
        is_active (bool): Whether pattern is active (can be disabled if causing false positives)
        created_at (datetime): When pattern was created
        last_used (datetime): Last time this pattern matched

    Tiered Matching:
        - Patterns with verified_count >= 100 are "promoted" (Tier 1)
        - System patterns are Tier 2 fallback (always reliable)
        - All other patterns are Tier 3 (regional merchants)

    Database Constraints:
        - regex_pattern is unique (prevents duplicates)
        - No Row Level Security - shared data across users
    """

    __tablename__ = "merchant_patterns"

    id = Column(SQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    merchant_name = Column(String, nullable=False)
    regex_pattern = Column(String, nullable=False, unique=True)
    raw_variants = Column(JSONB, default=[])  # Phase 2: track OCR variations
    usage_count = Column(Integer, default=0)
    verified_count = Column(Integer, default=0)  # Phase 2: user confirmations
    created_by = Column(String, default='system')  # 'system' | 'user_learning' | 'admin'
    confidence_score = Column(DECIMAL(3, 2), default=1.0)  # 0.0 to 1.0
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used = Column(DateTime(timezone=True))

    def to_dict(self):
        """
        Convert the MerchantPattern object to a dictionary for JSON serialization.

        Returns:
            dict: Dictionary containing all fields suitable for API responses
        """
        return {
            "id": str(self.id),
            "merchant_name": self.merchant_name,
            "regex_pattern": self.regex_pattern,
            "raw_variants": self.raw_variants,
            "usage_count": self.usage_count,
            "verified_count": self.verified_count,
            "created_by": self.created_by,
            "confidence_score": float(self.confidence_score) if self.confidence_score else 1.0,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_used": self.last_used.isoformat() if self.last_used else None,
        }

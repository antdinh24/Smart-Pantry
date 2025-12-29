"""
Ingredient Cache Model

This module defines the IngredientCache model for caching commonly used ingredients
from the OpenFoodFacts API. This cache improves search performance and reduces
external API calls.

Why this exists:
- Speeds up manual ingredient search (local database is faster than external API)
- Reduces dependency on OpenFoodFacts API (offline functionality)
- Shares ingredient data across all users (no user-specific data)

Product Manager Note:
- This is SHARED data (no Row Level Security)
- Populated from OpenFoodFacts API
- Updated when users search for new ingredients
"""

from sqlalchemy import Column, String, Integer, DateTime, UUID as SQLUUID, JSONB
from sqlalchemy.sql import func
from app.database import Base
import uuid


class IngredientCache(Base):
    """
    SQLAlchemy model for the ingredient_cache table.

    This model represents cached ingredient data from OpenFoodFacts.
    It's shared across all users to provide fast search results.

    Attributes:
        id (UUID): Primary key, auto-generated UUID
        ingredient_name (str): Display name (e.g., "Whole Milk", "Organic Eggs")
        normalized_name (str): Lowercase, singular form for matching (e.g., "milk", "egg")
        category (str): Food category (e.g., "dairy", "produce", "protein")
        barcode (str, optional): Product barcode if known from OpenFoodFacts
        popularity (int): Usage count across all users (higher = more popular)
        source (str): Data source, defaults to 'openfoodfacts'
        metadata (dict): Additional JSON data (brands, images, nutritional info, etc.)
        created_at (datetime): When this cache entry was created
        last_updated (datetime): Last time this entry was modified

    Why we cache ingredients:
        - Fast search without hitting external API
        - Offline functionality
        - Reduced API costs
        - Shared knowledge across all users
    """

    __tablename__ = "ingredient_cache"

    # Primary key
    id = Column(SQLUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Ingredient names (display and normalized for searching)
    ingredient_name = Column(String, nullable=False)  # User-facing name
    normalized_name = Column(String, nullable=False, index=True)  # Lowercase, singular for matching

    # Classification
    category = Column(String, nullable=False, index=True)  # dairy, produce, protein, etc.

    # Optional barcode (from OpenFoodFacts)
    barcode = Column(String, nullable=True)

    # Popularity tracking (incremented when users select this ingredient)
    popularity = Column(Integer, default=0)

    # Source tracking
    source = Column(String, default='openfoodfacts')  # Where this data came from

    # Additional metadata (brands, images, nutritional info)
    metadata = Column(JSONB)  # Flexible JSON storage

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_updated = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        """
        Convert the IngredientCache object to a dictionary for JSON serialization.

        This method is used when returning ingredient data via API endpoints.
        It converts SQLAlchemy model objects into plain Python dictionaries
        that can be serialized to JSON.

        Args:
            None (uses self)

        Returns:
            dict: A dictionary containing all ingredient cache fields:
                - id (str): UUID as string
                - ingredient_name (str): Display name
                - normalized_name (str): Lowercase, singular form
                - category (str): Food category
                - barcode (str|None): Product barcode if available
                - popularity (int): Usage count
                - source (str): Data source
                - metadata (dict|None): Additional JSON data

        Example:
            >>> ingredient = IngredientCache(
            ...     ingredient_name="Whole Milk",
            ...     normalized_name="milk",
            ...     category="dairy"
            ... )
            >>> ingredient.to_dict()
            {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "ingredient_name": "Whole Milk",
                "normalized_name": "milk",
                "category": "dairy",
                "barcode": None,
                "popularity": 0,
                "source": "openfoodfacts",
                "metadata": None
            }
        """
        return {
            "id": str(self.id),  # Convert UUID to string for JSON
            "ingredient_name": self.ingredient_name,
            "normalized_name": self.normalized_name,
            "category": self.category,
            "barcode": self.barcode,
            "popularity": self.popularity,
            "source": self.source,
            "metadata": self.metadata,
        }

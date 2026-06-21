"""
Recipe Model

Product Manager Note:
- Stores both AI-generated and user-created recipes
- Supports intelligent caching to minimize API calls
- Public recipes can be shared across users
- Tracks usage for popularity ranking
"""

from sqlalchemy import Column, String, Integer, Boolean, DateTime, UUID, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.database import Base
import uuid


class Recipe(Base):
    """
    Recipe model with caching support.

    Matches the schema in migrations/002_create_recipes_table.sql
    and 006_add_recipe_caching_fields.sql
    """

    __tablename__ = "recipes"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # User reference (nullable for public/cached recipes)
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # Recipe information
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # Ingredients and instructions (JSON)
    ingredient_list = Column(JSONB, nullable=False)
    # Format: [{"name": "tomato", "quantity": "2", "unit": "cups"}]

    instructions = Column(JSONB, nullable=False)
    # Format: [{"step": 1, "text": "Chop tomatoes"}]

    # Metadata
    prep_time_minutes = Column(Integer, nullable=True)
    cook_time_minutes = Column(Integer, nullable=True)
    servings = Column(Integer, default=1)
    difficulty = Column(String, nullable=True)  # 'easy', 'medium', 'hard'
    cuisine_type = Column(String, nullable=True)
    meal_type = Column(String, nullable=True, index=True)

    # Source tracking
    is_ai_generated = Column(Boolean, default=False, index=True)
    source_type = Column(String, nullable=True)  # 'ai', 'manual', 'photo', 'video'

    # Nutritional info (optional)
    nutritional_info = Column(JSONB, nullable=True)
    # Format: {"calories": 300, "protein": "20g", "fat": "10g"}

    # Caching fields
    ingredient_hash = Column(String, nullable=True, index=True)
    # SHA256 hash of normalized ingredient list for cache matching

    is_public = Column(Boolean, default=False, index=True)
    # If True, recipe is available to all users as cached recipe

    usage_count = Column(Integer, default=0, index=True)
    # Tracks popularity for ranking cached recipes

    generation_params = Column(JSONB, nullable=True)
    # Stores original preferences: {"cuisine": "Italian", "difficulty": "easy"}

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<Recipe {self.title}>"

    def to_dict(self):
        """Convert recipe to dictionary for API responses"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id) if self.user_id else None,
            "title": self.title,
            "description": self.description,
            "ingredient_list": self.ingredient_list,
            "instructions": self.instructions,
            "prep_time_minutes": self.prep_time_minutes,
            "cook_time_minutes": self.cook_time_minutes,
            "servings": self.servings,
            "difficulty": self.difficulty,
            "cuisine_type": self.cuisine_type,
            "meal_type": self.meal_type,
            "is_ai_generated": self.is_ai_generated,
            "source_type": self.source_type,
            "nutritional_info": self.nutritional_info,
            "is_public": self.is_public,
            "usage_count": self.usage_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def to_cache_summary(self):
        """Lightweight summary for cache listings"""
        return {
            "id": str(self.id),
            "title": self.title,
            "ingredient_hash": self.ingredient_hash,
            "cuisine_type": self.cuisine_type,
            "difficulty": self.difficulty,
            "usage_count": self.usage_count,
            "is_cached": True,
        }

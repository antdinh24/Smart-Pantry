"""
Database models for Smart Pantry.

Product Manager Note:
- These represent database tables
- SQLAlchemy automatically maps classes to tables
"""

from app.models.user import User
from app.models.pantry import PantryItem
from app.models.recipe import Recipe

__all__ = ["User", "PantryItem", "Recipe"]

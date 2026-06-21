"""
Database models for Smart Pantry.

Product Manager Note:
- These represent database tables
- SQLAlchemy automatically maps classes to tables
"""

from app.models.user import User
from app.models.pantry import PantryItem
from app.models.recipe import Recipe
from app.models.receipt import Receipt
from app.models.ingredient_cache import IngredientCache
from app.models.monthly_analytics import MonthlyAnalytics
from app.models.merchant_pattern import MerchantPattern

__all__ = [
    "User",
    "PantryItem",
    "Recipe",
    "Receipt",
    "IngredientCache",
    "MonthlyAnalytics",
    "MerchantPattern",
]

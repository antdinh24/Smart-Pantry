"""
Business logic services for Smart Pantry.

Product Manager Note:
- Services contain reusable business logic
- Keep routers thin, logic in services
- Services can be used by multiple endpoints
"""

from app.services.pantry import PantryService
from app.services.barcode import BarcodeService
from app.services.recipes import RecipeService
from app.services.recipe_similarity import RecipeSimilarityService
from app.services.openai_client import OpenAIRecipeGenerator

__all__ = [
    "PantryService",
    "BarcodeService",
    "RecipeService",
    "RecipeSimilarityService",
    "OpenAIRecipeGenerator",
]

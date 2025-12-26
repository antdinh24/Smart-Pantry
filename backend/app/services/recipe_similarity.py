"""
Recipe Similarity Service

Product Manager Note:
- Finds cached recipes that match user's ingredients
- Calculates similarity scores to minimize API calls
- Uses Jaccard similarity for ingredient matching
- Considers dietary restrictions and preferences
"""

import hashlib
import json
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.recipe import Recipe
from app.services.pantry import PantryService


class RecipeSimilarityService:
    """Service for finding similar recipes and cache matching"""

    # Similarity threshold for cache hits (80% = very similar)
    CACHE_SIMILARITY_THRESHOLD = 0.80

    @staticmethod
    def normalize_ingredient_list(ingredients: List[str]) -> List[str]:
        """
        Normalize ingredient list for consistent matching.

        Product Manager Note:
        - Converts to lowercase and singular form
        - Sorts alphabetically for consistent hashing
        - Removes duplicates

        Args:
            ingredients: List of ingredient names

        Returns:
            Normalized, sorted list
        """
        normalized = []

        for ingredient in ingredients:
            # Use pantry service normalization
            normalized_name = PantryService.normalize_ingredient_name(ingredient)
            if normalized_name and normalized_name not in normalized:
                normalized.append(normalized_name)

        # Sort for consistent ordering
        return sorted(normalized)

    @staticmethod
    def compute_ingredient_hash(ingredients: List[str]) -> str:
        """
        Compute SHA256 hash of ingredient list.

        Product Manager Note:
        - Creates unique identifier for ingredient combination
        - Used for fast cache lookups
        - Same ingredients = same hash (regardless of order)

        Args:
            ingredients: List of ingredient names

        Returns:
            SHA256 hash string
        """
        # Normalize and sort ingredients
        normalized = RecipeSimilarityService.normalize_ingredient_list(ingredients)

        # Create deterministic string
        ingredients_str = json.dumps(normalized, sort_keys=True)

        # Compute hash
        return hashlib.sha256(ingredients_str.encode()).hexdigest()

    @staticmethod
    def calculate_jaccard_similarity(set1: set, set2: set) -> float:
        """
        Calculate Jaccard similarity between two sets.

        Product Manager Note:
        - Jaccard = (intersection) / (union)
        - 1.0 = identical sets
        - 0.0 = no overlap
        - 0.8+ = very similar (good for caching)

        Example:
            set1 = {tomato, pasta, cheese}
            set2 = {tomato, pasta, basil}
            similarity = 2/4 = 0.5 (50% similar)

        Args:
            set1: First set of items
            set2: Second set of items

        Returns:
            Similarity score (0.0 to 1.0)
        """
        if not set1 and not set2:
            return 1.0

        if not set1 or not set2:
            return 0.0

        intersection = set1.intersection(set2)
        union = set1.union(set2)

        return len(intersection) / len(union)

    @staticmethod
    def find_cached_recipe(
        db: Session,
        ingredients: List[str],
        preferences: Optional[Dict] = None,
        min_similarity: float = CACHE_SIMILARITY_THRESHOLD
    ) -> Optional[Tuple[Recipe, float]]:
        """
        Find a cached recipe that matches the ingredients.

        Product Manager Note:
        - First checks for exact hash match (instant cache hit!)
        - Then checks similar recipes using Jaccard similarity
        - Considers user preferences (cuisine, difficulty)
        - Returns most similar recipe above threshold

        Cache Hit Scenarios:
        1. Exact match: Same ingredients → instant return
        2. Very similar (80%+): Similar ingredients → return cached recipe
        3. No match: Generate new recipe with OpenAI

        Args:
            db: Database session
            ingredients: List of ingredient names
            preferences: Optional preferences (cuisine, difficulty, etc.)
            min_similarity: Minimum similarity score (default: 0.80)

        Returns:
            Tuple of (Recipe, similarity_score) or None if no match
        """
        # Compute hash for exact matching
        ingredient_hash = RecipeSimilarityService.compute_ingredient_hash(ingredients)

        # Normalize ingredients for similarity matching
        normalized_ingredients = set(
            RecipeSimilarityService.normalize_ingredient_list(ingredients)
        )

        # First, try exact hash match (fastest)
        exact_match = db.query(Recipe).filter(
            Recipe.ingredient_hash == ingredient_hash,
            Recipe.is_public == True,
            Recipe.is_ai_generated == True
        ).first()

        if exact_match:
            return (exact_match, 1.0)  # 100% similarity

        # No exact match, try similarity matching
        # Get all public AI-generated recipes
        cached_recipes = db.query(Recipe).filter(
            Recipe.is_public == True,
            Recipe.is_ai_generated == True
        ).all()

        best_match = None
        best_similarity = 0.0

        for recipe in cached_recipes:
            # Extract ingredient names from recipe
            recipe_ingredients = set()
            for ingredient in recipe.ingredient_list:
                if isinstance(ingredient, dict) and 'name' in ingredient:
                    normalized = PantryService.normalize_ingredient_name(ingredient['name'])
                    recipe_ingredients.add(normalized)

            # Calculate similarity
            similarity = RecipeSimilarityService.calculate_jaccard_similarity(
                normalized_ingredients,
                recipe_ingredients
            )

            # Check if this is a better match
            if similarity >= min_similarity and similarity > best_similarity:
                # If preferences specified, check compatibility
                if preferences:
                    # Check cuisine match
                    if preferences.get('cuisine') and recipe.cuisine_type:
                        if preferences['cuisine'].lower() != recipe.cuisine_type.lower():
                            continue

                    # Check difficulty match
                    if preferences.get('difficulty') and recipe.difficulty:
                        if preferences['difficulty'].lower() != recipe.difficulty.lower():
                            continue

                    # Check meal type match
                    if preferences.get('meal_type') and recipe.meal_type:
                        if preferences['meal_type'].lower() != recipe.meal_type.lower():
                            continue

                # Update best match
                best_match = recipe
                best_similarity = similarity

        if best_match and best_similarity >= min_similarity:
            return (best_match, best_similarity)

        return None

    @staticmethod
    def calculate_pantry_match(
        db: Session,
        recipe_id: str,
        user_pantry_items: List[Dict]
    ) -> float:
        """
        Calculate how much of the recipe the user can make with their pantry.

        Product Manager Note:
        - Shows "match percentage" in UI
        - Helps users find recipes they can make right now
        - 100% = can make entirely from pantry
        - 50% = need to buy half the ingredients

        Args:
            db: Database session
            recipe_id: Recipe ID
            user_pantry_items: List of pantry items (from PantryService)

        Returns:
            Match percentage (0.0 to 1.0)
        """
        # Get recipe
        recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
        if not recipe:
            return 0.0

        # Get recipe ingredients
        recipe_ingredients = set()
        for ingredient in recipe.ingredient_list:
            if isinstance(ingredient, dict) and 'name' in ingredient:
                normalized = PantryService.normalize_ingredient_name(ingredient['name'])
                recipe_ingredients.add(normalized)

        if not recipe_ingredients:
            return 0.0

        # Get user's pantry ingredients
        pantry_ingredients = set()
        for item in user_pantry_items:
            if 'normalized_name' in item:
                pantry_ingredients.add(item['normalized_name'])

        # Calculate match
        matching_ingredients = recipe_ingredients.intersection(pantry_ingredients)

        return len(matching_ingredients) / len(recipe_ingredients)

    @staticmethod
    def get_cache_statistics(db: Session) -> Dict:
        """
        Get caching statistics for monitoring.

        Product Manager Note:
        - Tracks cache effectiveness
        - Shows cost savings (fewer API calls)
        - Helps optimize cache strategy

        Returns:
            Dict with cache stats
        """
        total_recipes = db.query(Recipe).filter(Recipe.is_ai_generated == True).count()
        public_recipes = db.query(Recipe).filter(
            Recipe.is_ai_generated == True,
            Recipe.is_public == True
        ).count()
        total_usage = db.query(func.sum(Recipe.usage_count)).scalar() or 0

        # Estimate cost savings
        # Assume $0.002 per API call (GPT-4 turbo)
        # Each cached recipe saves 1 API call
        estimated_api_calls_saved = total_usage - public_recipes
        estimated_cost_saved = estimated_api_calls_saved * 0.002

        return {
            "total_ai_recipes": total_recipes,
            "public_cached_recipes": public_recipes,
            "total_recipe_uses": total_usage,
            "cache_hit_rate": (public_recipes / total_recipes) if total_recipes > 0 else 0,
            "estimated_api_calls_saved": max(0, estimated_api_calls_saved),
            "estimated_cost_saved_usd": max(0, estimated_cost_saved),
        }

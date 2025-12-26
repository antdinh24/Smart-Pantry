"""
Recipe Service with Intelligent Caching

Product Manager Note:
- MINIMIZES OpenAI API calls by using cached recipes
- Checks cache BEFORE generating new recipes
- Shares recipes across users to maximize savings
- Tracks cache effectiveness

Strategy:
1. User requests recipe → Check cache first
2. Cache hit (80%+ similar) → Return cached recipe
3. Cache miss → Generate with OpenAI
4. Save new recipe as public → Future users benefit

Cost Savings Example:
- Without caching: 1000 users = 1000 API calls ($2-10)
- With caching: 1000 users = 100 API calls ($0.20-1) - 90% savings!
"""

from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from app.models.recipe import Recipe
from app.services.recipe_similarity import RecipeSimilarityService
from app.services.openai_client import OpenAIRecipeGenerator
import uuid


class RecipeService:
    """Main service for recipe operations with intelligent caching"""

    @staticmethod
    def generate_or_find_recipe(
        db: Session,
        user_id: str,
        ingredients: List[str],
        preferences: Optional[Dict] = None
    ) -> Dict:
        """
        Generate recipe with intelligent caching.

        Product Manager Note:
        - This is the MAIN method - implements smart caching
        - Checks cache first (saves $$)
        - Only calls OpenAI if no similar recipe exists
        - Returns cache hit info for transparency

        Flow:
        1. Normalize ingredients
        2. Check for cached recipe (80%+ similar)
        3. If found → Increment usage, return cached
        4. If not found → Generate with OpenAI, save as public
        5. Return recipe with metadata (cached or new)

        Args:
            db: Database session
            user_id: User ID (for saving to user's recipes)
            ingredients: List of available ingredients
            preferences: Optional preferences (cuisine, difficulty, etc.)

        Returns:
            Dict with:
                - recipe: Full recipe data
                - from_cache: Boolean (was this cached?)
                - cache_similarity: Float (how similar to cache)
                - api_call_saved: Boolean (did we save an API call?)
        """
        preferences = preferences or {}

        # Step 1: Try to find cached recipe
        cached_result = RecipeSimilarityService.find_cached_recipe(
            db=db,
            ingredients=ingredients,
            preferences=preferences,
            min_similarity=0.80  # 80% threshold
        )

        if cached_result:
            recipe, similarity = cached_result

            # Increment usage count (tracks popularity)
            recipe.usage_count += 1
            db.commit()

            # Also save to user's personal recipes if they want
            user_recipe = Recipe(
                id=uuid.uuid4(),
                user_id=uuid.UUID(user_id),
                title=recipe.title,
                description=recipe.description,
                ingredient_list=recipe.ingredient_list,
                instructions=recipe.instructions,
                prep_time_minutes=recipe.prep_time_minutes,
                cook_time_minutes=recipe.cook_time_minutes,
                servings=recipe.servings,
                difficulty=recipe.difficulty,
                cuisine_type=recipe.cuisine_type,
                meal_type=recipe.meal_type,
                is_ai_generated=True,
                source_type='ai',
                nutritional_info=recipe.nutritional_info,
                is_public=False,  # User's personal copy
            )
            db.add(user_recipe)
            db.commit()
            db.refresh(user_recipe)

            return {
                "recipe": user_recipe.to_dict(),
                "from_cache": True,
                "cache_similarity": similarity,
                "api_call_saved": True,
                "message": f"Found cached recipe with {similarity*100:.0f}% similarity"
            }

        # Step 2: No cache hit - generate new recipe with OpenAI
        generator = OpenAIRecipeGenerator()

        recipe_data = generator.generate_recipe(
            ingredients=ingredients,
            preferences=preferences
        )

        # Step 3: Compute hash for future caching
        ingredient_hash = RecipeSimilarityService.compute_ingredient_hash(ingredients)

        # Step 4: Save as PUBLIC recipe (available to all users)
        public_recipe = Recipe(
            id=uuid.uuid4(),
            user_id=None,  # No specific owner - it's public
            title=recipe_data['title'],
            description=recipe_data['description'],
            ingredient_list=recipe_data['ingredient_list'],
            instructions=recipe_data['instructions'],
            prep_time_minutes=recipe_data['prep_time_minutes'],
            cook_time_minutes=recipe_data['cook_time_minutes'],
            servings=recipe_data['servings'],
            difficulty=recipe_data['difficulty'],
            cuisine_type=recipe_data['cuisine_type'],
            meal_type=recipe_data['meal_type'],
            is_ai_generated=True,
            source_type='ai',
            nutritional_info=recipe_data['nutritional_info'],
            is_public=True,  # PUBLIC - available to all users!
            ingredient_hash=ingredient_hash,
            usage_count=1,  # First use
            generation_params=preferences,
        )
        db.add(public_recipe)
        db.commit()

        # Step 5: Also save to user's personal recipes
        user_recipe = Recipe(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_id),
            title=recipe_data['title'],
            description=recipe_data['description'],
            ingredient_list=recipe_data['ingredient_list'],
            instructions=recipe_data['instructions'],
            prep_time_minutes=recipe_data['prep_time_minutes'],
            cook_time_minutes=recipe_data['cook_time_minutes'],
            servings=recipe_data['servings'],
            difficulty=recipe_data['difficulty'],
            cuisine_type=recipe_data['cuisine_type'],
            meal_type=recipe_data['meal_type'],
            is_ai_generated=True,
            source_type='ai',
            nutritional_info=recipe_data['nutritional_info'],
            is_public=False,  # User's personal copy
        )
        db.add(user_recipe)
        db.commit()
        db.refresh(user_recipe)

        return {
            "recipe": user_recipe.to_dict(),
            "from_cache": False,
            "cache_similarity": 0.0,
            "api_call_saved": False,
            "message": "Generated new recipe with OpenAI (now cached for future users)"
        }

    @staticmethod
    def get_recipe_suggestions(
        db: Session,
        user_id: str,
        pantry_items: List[Dict],
        limit: int = 10
    ) -> List[Dict]:
        """
        Get recipe suggestions based on user's pantry.

        Product Manager Note:
        - Shows recipes user can make NOW
        - Sorted by match percentage
        - No API calls - uses cached recipes only
        - Fast and free!

        Args:
            db: Database session
            user_id: User ID
            pantry_items: User's pantry items
            limit: Max number of suggestions

        Returns:
            List of recipe suggestions with match percentages
        """
        # Get all public cached recipes
        cached_recipes = db.query(Recipe).filter(
            Recipe.is_public == True,
            Recipe.is_ai_generated == True
        ).order_by(Recipe.usage_count.desc()).limit(limit * 3).all()

        # Calculate match percentage for each
        suggestions = []
        for recipe in cached_recipes:
            match_percentage = RecipeSimilarityService.calculate_pantry_match(
                db=db,
                recipe_id=str(recipe.id),
                user_pantry_items=pantry_items
            )

            # Only include if user has at least 50% of ingredients
            if match_percentage >= 0.5:
                recipe_dict = recipe.to_dict()
                recipe_dict['match_percentage'] = match_percentage
                suggestions.append(recipe_dict)

        # Sort by match percentage (highest first)
        suggestions.sort(key=lambda x: x['match_percentage'], reverse=True)

        return suggestions[:limit]

    @staticmethod
    def save_user_recipe(
        db: Session,
        user_id: str,
        recipe_data: Dict
    ) -> Recipe:
        """
        Save user's custom recipe.

        Product Manager Note:
        - User manually creates recipe
        - Not AI-generated
        - Private (not shared with other users)

        Args:
            db: Database session
            user_id: User ID
            recipe_data: Recipe data

        Returns:
            Created recipe
        """
        recipe = Recipe(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_id),
            title=recipe_data['title'],
            description=recipe_data.get('description'),
            ingredient_list=recipe_data['ingredient_list'],
            instructions=recipe_data['instructions'],
            prep_time_minutes=recipe_data.get('prep_time_minutes'),
            cook_time_minutes=recipe_data.get('cook_time_minutes'),
            servings=recipe_data.get('servings', 1),
            difficulty=recipe_data.get('difficulty'),
            cuisine_type=recipe_data.get('cuisine_type'),
            meal_type=recipe_data.get('meal_type'),
            is_ai_generated=False,
            source_type='manual',
            nutritional_info=recipe_data.get('nutritional_info'),
            is_public=False,
        )

        db.add(recipe)
        db.commit()
        db.refresh(recipe)

        return recipe

    @staticmethod
    def get_user_recipes(
        db: Session,
        user_id: str
    ) -> List[Recipe]:
        """
        Get all recipes saved by user.

        Args:
            db: Database session
            user_id: User ID

        Returns:
            List of user's recipes
        """
        return db.query(Recipe).filter(
            Recipe.user_id == user_id
        ).order_by(Recipe.created_at.desc()).all()

    @staticmethod
    def get_recipe_by_id(
        db: Session,
        recipe_id: str,
        user_id: str
    ) -> Optional[Recipe]:
        """
        Get specific recipe by ID.

        Product Manager Note:
        - User can access own recipes OR public recipes

        Args:
            db: Database session
            recipe_id: Recipe ID
            user_id: User ID

        Returns:
            Recipe or None
        """
        return db.query(Recipe).filter(
            Recipe.id == recipe_id,
            (Recipe.user_id == user_id) | (Recipe.is_public == True)
        ).first()

    @staticmethod
    def get_cache_stats(db: Session) -> Dict:
        """
        Get caching statistics.

        Product Manager Note:
        - Shows how much money we're saving
        - Tracks cache effectiveness
        - Used for analytics dashboard

        Returns:
            Cache statistics dict
        """
        return RecipeSimilarityService.get_cache_statistics(db)

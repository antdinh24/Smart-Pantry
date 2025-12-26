"""
Recipe Router

Product Manager Note:
- AI-powered recipe generation with intelligent caching
- Minimizes OpenAI API calls by reusing similar recipes
- Provides recipe suggestions based on pantry
- Tracks cache effectiveness

Endpoints:
- POST /api/v1/recipes/generate - Generate recipe (checks cache first!)
- GET /api/v1/recipes/suggestions - Get recipe suggestions from pantry
- GET /api/v1/recipes - Get user's saved recipes
- GET /api/v1/recipes/:id - Get specific recipe
- POST /api/v1/recipes - Save user's custom recipe
- GET /api/v1/recipes/:id/match - Calculate pantry match %
- GET /api/v1/recipes/cache/stats - Get caching statistics
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from app.database import get_db
from app.models.pantry import PantryItem
from app.middleware.auth import get_current_user_id
from app.services.recipes import RecipeService
from app.services.recipe_similarity import RecipeSimilarityService
from app.services.pantry import PantryService

router = APIRouter()


# ============================================================
# REQUEST/RESPONSE SCHEMAS
# ============================================================


class GenerateRecipeRequest(BaseModel):
    """Request for recipe generation"""
    ingredients: List[str] = Field(..., min_items=1)
    preferences: Optional[Dict] = Field(default=None)
    # preferences can include:
    # {
    #     "cuisine": "Italian",
    #     "difficulty": "easy",
    #     "meal_type": "dinner",
    #     "dietary_restrictions": ["vegetarian"],
    #     "servings": 4
    # }


class RecipeIngredient(BaseModel):
    """Single ingredient in a recipe"""
    name: str
    quantity: str
    unit: str


class RecipeInstruction(BaseModel):
    """Single instruction step"""
    step: int
    text: str


class SaveRecipeRequest(BaseModel):
    """Request to save custom recipe"""
    title: str = Field(..., min_length=1)
    description: Optional[str] = None
    ingredient_list: List[Dict]
    instructions: List[Dict]
    prep_time_minutes: Optional[int] = None
    cook_time_minutes: Optional[int] = None
    servings: Optional[int] = 1
    difficulty: Optional[str] = None
    cuisine_type: Optional[str] = None
    meal_type: Optional[str] = None
    nutritional_info: Optional[Dict] = None


class RecipeResponse(BaseModel):
    """Standard recipe response"""
    id: str
    user_id: Optional[str]
    title: str
    description: Optional[str]
    ingredient_list: List[Dict]
    instructions: List[Dict]
    prep_time_minutes: Optional[int]
    cook_time_minutes: Optional[int]
    servings: int
    difficulty: Optional[str]
    cuisine_type: Optional[str]
    meal_type: Optional[str]
    is_ai_generated: bool
    nutritional_info: Optional[Dict]
    is_public: bool
    usage_count: int
    created_at: str
    updated_at: str


class GenerateRecipeResponse(BaseModel):
    """Response for recipe generation with cache info"""
    recipe: RecipeResponse
    from_cache: bool
    cache_similarity: float
    api_call_saved: bool
    message: str


class RecipeSuggestion(BaseModel):
    """Recipe suggestion with match percentage"""
    id: str
    title: str
    description: Optional[str]
    match_percentage: float
    difficulty: Optional[str]
    cuisine_type: Optional[str]
    prep_time_minutes: Optional[int]
    cook_time_minutes: Optional[int]


class MatchResponse(BaseModel):
    """Pantry match percentage response"""
    recipe_id: str
    match_percentage: float
    matching_ingredients: int
    total_ingredients: int
    missing_ingredients: List[str]


class CacheStatsResponse(BaseModel):
    """Cache statistics response"""
    total_ai_recipes: int
    public_cached_recipes: int
    total_recipe_uses: int
    cache_hit_rate: float
    estimated_api_calls_saved: int
    estimated_cost_saved_usd: float


# ============================================================
# ENDPOINTS
# ============================================================


@router.post("/generate", response_model=GenerateRecipeResponse)
async def generate_recipe(
    request: GenerateRecipeRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Generate recipe with intelligent caching.

    Product Manager Note:
    - **CHECKS CACHE FIRST** to minimize API calls!
    - If 80%+ similar recipe exists → Return cached (FREE!)
    - If no match → Generate with OpenAI ($0.002-0.01 cost)
    - Saves new recipes as public → Future users benefit

    Cache Hit Example:
        User 1: "tomato, pasta, cheese" → Generates "Pasta Marinara" ($0.005)
        User 2: "tomatoes, pasta, mozzarella" → Returns cached (FREE!)
        Savings: $0.005 per cache hit

    Args:
        request: Ingredients + preferences
        user_id: Current user ID
        db: Database session

    Returns:
        Recipe with cache metadata
    """
    try:
        result = RecipeService.generate_or_find_recipe(
            db=db,
            user_id=user_id,
            ingredients=request.ingredients,
            preferences=request.preferences
        )

        return GenerateRecipeResponse(
            recipe=RecipeResponse(**result['recipe']),
            from_cache=result['from_cache'],
            cache_similarity=result['cache_similarity'],
            api_call_saved=result['api_call_saved'],
            message=result['message']
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Recipe generation failed: {str(e)}"
        )


@router.get("/suggestions", response_model=List[RecipeSuggestion])
async def get_recipe_suggestions(
    limit: int = 10,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Get recipe suggestions based on user's pantry.

    Product Manager Note:
    - Shows recipes user can make RIGHT NOW
    - No API calls - uses cached recipes only (FREE!)
    - Sorted by match percentage (highest first)
    - Instant results!

    Args:
        limit: Max number of suggestions (default: 10)
        user_id: Current user ID
        db: Database session

    Returns:
        List of recipe suggestions with match %
    """
    # Get user's pantry items
    pantry_items = PantryService.get_user_pantry(db, user_id)
    pantry_dicts = [item.to_dict() for item in pantry_items]

    # Get suggestions
    suggestions = RecipeService.get_recipe_suggestions(
        db=db,
        user_id=user_id,
        pantry_items=pantry_dicts,
        limit=limit
    )

    # Format response
    return [
        RecipeSuggestion(
            id=s['id'],
            title=s['title'],
            description=s['description'],
            match_percentage=s['match_percentage'],
            difficulty=s['difficulty'],
            cuisine_type=s['cuisine_type'],
            prep_time_minutes=s['prep_time_minutes'],
            cook_time_minutes=s['cook_time_minutes']
        )
        for s in suggestions
    ]


@router.get("", response_model=List[RecipeResponse])
async def get_user_recipes(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Get all recipes saved by user.

    Product Manager Note:
    - Includes both AI-generated and manually created recipes
    - User's personal collection

    Args:
        user_id: Current user ID
        db: Database session

    Returns:
        List of user's recipes
    """
    recipes = RecipeService.get_user_recipes(db, user_id)

    return [RecipeResponse(**recipe.to_dict()) for recipe in recipes]


@router.get("/{recipe_id}", response_model=RecipeResponse)
async def get_recipe(
    recipe_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Get specific recipe by ID.

    Product Manager Note:
    - User can access own recipes OR public cached recipes

    Args:
        recipe_id: Recipe ID
        user_id: Current user ID
        db: Database session

    Returns:
        Recipe details

    Raises:
        404: Recipe not found
    """
    recipe = RecipeService.get_recipe_by_id(db, recipe_id, user_id)

    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found"
        )

    return RecipeResponse(**recipe.to_dict())


@router.post("", status_code=status.HTTP_201_CREATED, response_model=RecipeResponse)
async def save_recipe(
    request: SaveRecipeRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Save user's custom recipe.

    Product Manager Note:
    - User manually creates recipe
    - Not AI-generated
    - Private (not shared)

    Args:
        request: Recipe data
        user_id: Current user ID
        db: Database session

    Returns:
        Created recipe
    """
    recipe_data = request.dict()
    recipe = RecipeService.save_user_recipe(db, user_id, recipe_data)

    return RecipeResponse(**recipe.to_dict())


@router.get("/{recipe_id}/match", response_model=MatchResponse)
async def calculate_match(
    recipe_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Calculate how much of recipe user can make with their pantry.

    Product Manager Note:
    - Shows "You have 80% of the ingredients!"
    - Helps users decide if they should make this recipe
    - Lists what's missing

    Args:
        recipe_id: Recipe ID
        user_id: Current user ID
        db: Database session

    Returns:
        Match percentage and missing ingredients

    Raises:
        404: Recipe not found
    """
    # Get recipe
    recipe = RecipeService.get_recipe_by_id(db, recipe_id, user_id)
    if not recipe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipe not found"
        )

    # Get user's pantry
    pantry_items = PantryService.get_user_pantry(db, user_id)
    pantry_dicts = [item.to_dict() for item in pantry_items]

    # Calculate match
    match_percentage = RecipeSimilarityService.calculate_pantry_match(
        db=db,
        recipe_id=recipe_id,
        user_pantry_items=pantry_dicts
    )

    # Get pantry ingredient names
    pantry_ingredients = set(item['normalized_name'] for item in pantry_dicts)

    # Get recipe ingredients
    recipe_ingredients = set()
    missing_ingredients = []

    for ingredient in recipe.ingredient_list:
        if isinstance(ingredient, dict) and 'name' in ingredient:
            normalized = PantryService.normalize_ingredient_name(ingredient['name'])
            recipe_ingredients.add(normalized)

            if normalized not in pantry_ingredients:
                missing_ingredients.append(ingredient['name'])

    return MatchResponse(
        recipe_id=recipe_id,
        match_percentage=match_percentage,
        matching_ingredients=len(recipe_ingredients) - len(missing_ingredients),
        total_ingredients=len(recipe_ingredients),
        missing_ingredients=missing_ingredients
    )


@router.get("/cache/stats", response_model=CacheStatsResponse)
async def get_cache_stats(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Get caching statistics.

    Product Manager Note:
    - Shows cache effectiveness
    - Tracks cost savings
    - Used for analytics dashboard

    Returns:
        Cache statistics
    """
    stats = RecipeService.get_cache_stats(db)

    return CacheStatsResponse(**stats)

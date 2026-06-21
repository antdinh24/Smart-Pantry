"""
Ingredients Router

Product Manager Note:
- Provides ingredient search for manual entry
- Cache-first strategy (fast offline search)
- Falls back to OpenFoodFacts API if needed
- Tracks popularity for better rankings

Endpoints:
- GET /api/v1/ingredients/search - Search ingredients
- POST /api/v1/ingredients/:id/select - Track ingredient selection
- GET /api/v1/ingredients/popular - Get popular ingredients
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from app.database import get_db
from app.middleware.auth import get_current_user_id
from app.services.ingredient_search import IngredientSearchService

router = APIRouter()


# ============================================================
# REQUEST/RESPONSE SCHEMAS
# ============================================================


class IngredientSearchResult(BaseModel):
    """Search result for ingredient"""
    id: Optional[str] = None
    ingredient_name: str
    normalized_name: str
    category: Optional[str]
    barcode: Optional[str] = None
    popularity: Optional[int] = 0
    source: str
    metadata: Optional[Dict] = None


class SearchResponse(BaseModel):
    """Response from search endpoint"""
    query: str
    results: List[IngredientSearchResult]
    count: int


class SelectIngredientRequest(BaseModel):
    """Request body for tracking ingredient selection"""
    ingredient_id: str = Field(..., description="Ingredient cache ID")


class SelectIngredientResponse(BaseModel):
    """Response from select endpoint"""
    status: str
    message: str


# ============================================================
# ENDPOINTS
# ============================================================


@router.get("/search", response_model=SearchResponse)
async def search_ingredients(
    q: str = Query(..., min_length=1, max_length=100, description="Search query"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results to return"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Search for ingredients using cache-first strategy.

    Product Manager Note:
    - Searches local cache first (instant results)
    - Falls back to OpenFoodFacts API if cache insufficient (<10 results)
    - Auto-caches new API results for future searches
    - Supports offline search (cache-only when API unavailable)
    - Results sorted by popularity (most selected first)

    Strategy:
    1. Query local cache (PostgreSQL full-text search)
    2. If cache has <10 results, query OpenFoodFacts API
    3. Cache new API results
    4. Return combined results (deduplicated)

    Use Cases:
    - Manual ingredient entry in app
    - Autocomplete suggestions
    - Correcting OCR mistakes in receipts

    Args:
        q: Search term (e.g., "milk", "organic banana")
        limit: Maximum results (default: 20, max: 100)
        user_id: Current user ID (for auth)
        db: Database session

    Returns:
        Search results with ingredient details

    Raises:
        400: Invalid query
        500: Search service error

    Example:
        GET /api/v1/ingredients/search?q=milk&limit=10

        Response:
        {
            "query": "milk",
            "results": [
                {
                    "id": "uuid",
                    "ingredient_name": "Whole Milk",
                    "normalized_name": "milk",
                    "category": "dairy",
                    "popularity": 1250,
                    "source": "cache"
                },
                ...
            ],
            "count": 10
        }
    """
    try:
        # Validate query
        query = q.strip()
        if not query:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Search query cannot be empty"
            )

        # Search ingredients
        results = IngredientSearchService.search(query, db, limit=limit)

        # Format response
        return SearchResponse(
            query=query,
            results=[
                IngredientSearchResult(
                    id=result.get('id'),
                    ingredient_name=result['ingredient_name'],
                    normalized_name=result['normalized_name'],
                    category=result.get('category'),
                    barcode=result.get('barcode'),
                    popularity=result.get('popularity', 0),
                    source=result.get('source', 'unknown'),
                    metadata=result.get('metadata')
                )
                for result in results
            ],
            count=len(results)
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}"
        )


@router.post("/{ingredient_id}/select", response_model=SelectIngredientResponse)
async def select_ingredient(
    ingredient_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Track ingredient selection (popularity++).

    Product Manager Note:
    - Increments popularity counter when user selects ingredient
    - Helps popular ingredients rank higher in search
    - Privacy-focused: only tracks aggregate counts, not user-specific
    - Called when user confirms ingredient in manual entry flow

    Flow:
    1. User searches for ingredient
    2. User selects ingredient from results
    3. Mobile app calls this endpoint
    4. Backend increments popularity
    5. Future searches rank this ingredient higher

    Args:
        ingredient_id: Ingredient cache UUID
        user_id: Current user ID (for auth)
        db: Database session

    Returns:
        Success message

    Raises:
        404: Ingredient not found in cache
        500: Update failed

    Example:
        POST /api/v1/ingredients/abc-123-def/select

        Response:
        {
            "status": "success",
            "message": "Ingredient popularity updated"
        }
    """
    try:
        # Increment popularity
        IngredientSearchService.increment_popularity(ingredient_id, db)

        return SelectIngredientResponse(
            status="success",
            message="Ingredient popularity updated"
        )

    except Exception as e:
        # Note: Service handles not found silently, so this is for other errors
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update popularity: {str(e)}"
        )


@router.get("/popular", response_model=List[IngredientSearchResult])
async def get_popular_ingredients(
    limit: int = Query(100, ge=1, le=200, description="Maximum results to return"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Get most popular ingredients.

    Product Manager Note:
    - Returns ingredients sorted by selection count
    - Useful for "Recently Added" or "Popular Items" suggestions
    - Can be used for autocomplete defaults
    - Privacy-focused: aggregate popularity only

    Use Cases:
    - Show popular items when search is empty
    - Pre-populate autocomplete suggestions
    - "Quick Add" buttons for common items

    Args:
        limit: Maximum results (default: 100, max: 200)
        user_id: Current user ID (for auth)
        db: Database session

    Returns:
        List of popular ingredients

    Example:
        GET /api/v1/ingredients/popular?limit=20

        Response:
        [
            {
                "ingredient_name": "Whole Milk",
                "normalized_name": "milk",
                "category": "dairy",
                "popularity": 1250,
                "source": "cache"
            },
            ...
        ]
    """
    try:
        results = IngredientSearchService.get_popular_ingredients(db, limit=limit)

        return [
            IngredientSearchResult(
                id=result.get('id'),
                ingredient_name=result['ingredient_name'],
                normalized_name=result['normalized_name'],
                category=result.get('category'),
                barcode=result.get('barcode'),
                popularity=result.get('popularity', 0),
                source=result.get('source', 'cache'),
                metadata=result.get('metadata')
            )
            for result in results
        ]

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch popular ingredients: {str(e)}"
        )

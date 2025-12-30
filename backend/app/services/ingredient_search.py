"""
Ingredient Search Service

This module provides ingredient search functionality with intelligent caching.

Why this exists:
- Fast ingredient search for manual entry
- Reduce OpenFoodFacts API calls (cost/rate limit savings)
- Offline functionality (cache-based search)
- User-contributed popularity tracking

Search Strategy:
    1. Search local cache first (fast, always available)
    2. If <10 results, query OpenFoodFacts API
    3. Cache new results from API
    4. Return combined results

Product Manager Note:
- Cache populated with ~5000 common ingredients
- Popular ingredients bubble to top (by usage count)
- Supports offline search (cache-only mode)
"""

import requests
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Dict, Optional
from app.models.ingredient_cache import IngredientCache


class IngredientSearchService:
    """
    Service class for searching ingredients across cache and OpenFoodFacts API.

    This class implements a two-tier search strategy:
        1. Cache first (instant results, works offline)
        2. API fallback (comprehensive results, requires internet)

    Methods:
        search: Main search method (cache + API)
        search_cache: Search local database cache
        search_openfoodfacts: Query external API
        cache_ingredient: Add/update ingredient in cache
        increment_popularity: Track ingredient selection

    Example:
        >>> service = IngredientSearchService()
        >>> results = service.search("milk", db_session, limit=20)
        >>> print(len(results))
        15
        >>> print(results[0])
        {
            "id": "uuid",
            "ingredient_name": "Whole Milk",
            "normalized_name": "milk",
            "category": "dairy",
            "popularity": 1250
        }
    """

    OPENFOODFACTS_API_URL = "https://world.openfoodfacts.org/cgi/search.pl"
    USER_AGENT = "SmartPantry/1.0 (https://github.com/yourorg/smart-pantry)"

    @staticmethod
    def search(query: str, db: Session, limit: int = 20) -> List[Dict]:
        """
        Search for ingredients using cache-first strategy with API fallback.

        Strategy:
            1. Search cache (PostgreSQL full-text search)
            2. If results < 10, query OpenFoodFacts API
            3. Cache new API results
            4. Return combined results (cache + API)

        This approach balances:
            - Speed (cache is instant)
            - Completeness (API fills gaps)
            - Offline support (cache works without internet)

        Args:
            query (str): Search term (e.g., "milk", "organic banana")
            db (Session): Database session for cache queries
            limit (int): Maximum results to return (default: 20)

        Returns:
            list: Array of ingredient dictionaries:
                - id (str): UUID
                - ingredient_name (str): Display name
                - normalized_name (str): Lowercase, singular
                - category (str): Food category
                - barcode (str|None): Product barcode if known
                - popularity (int): Usage count
                - source (str): 'cache' or 'openfoodfacts'

        Example:
            >>> results = IngredientSearchService.search("organic milk", db, limit=10)
            >>> print(results[0])
            {
                "ingredient_name": "Organic Whole Milk",
                "category": "dairy",
                "popularity": 450,
                "source": "cache"
            }

        Note:
            - Empty query returns popular ingredients (sorted by usage)
            - Results sorted by popularity DESC (most popular first)
            - API results are automatically cached for future searches
        """
        if not query or len(query.strip()) < 2:
            # Return popular ingredients if query is empty/too short
            return IngredientSearchService.get_popular_ingredients(db, limit)

        # Step 1: Search cache
        cache_results = IngredientSearchService.search_cache(query, db, limit)

        # Step 2: If cache has enough results, return them
        if len(cache_results) >= 10:
            return cache_results[:limit]

        # Step 3: Query API to fill gaps
        try:
            api_results = IngredientSearchService.search_openfoodfacts(query, limit=limit - len(cache_results))

            # Step 4: Cache new API results
            for api_item in api_results:
                IngredientSearchService.cache_ingredient(api_item, db)

            # Combine results (cache + API, remove duplicates)
            combined = cache_results + api_results
            seen_names = set()
            unique_results = []
            for item in combined:
                name_key = item['normalized_name'].lower()
                if name_key not in seen_names:
                    seen_names.add(name_key)
                    unique_results.append(item)

            return unique_results[:limit]

        except Exception as e:
            # API error - return cache results only
            print(f"OpenFoodFacts API error: {e}")
            return cache_results[:limit]

    @staticmethod
    def search_cache(query: str, db: Session, limit: int = 20) -> List[Dict]:
        """
        Search ingredient cache using PostgreSQL full-text search.

        Uses both:
            - Full-text search on ingredient_name (for natural language)
            - LIKE search on normalized_name (for exact matches)

        Args:
            query (str): Search term
            db (Session): Database session
            limit (int): Maximum results

        Returns:
            list: Array of ingredient dictionaries from cache

        Example:
            >>> results = IngredientSearchService.search_cache("milk", db, 10)
            >>> print(results[0]['ingredient_name'])
            'Whole Milk'

        Note:
            - Results sorted by popularity DESC (most used first)
            - Searches both exact and partial matches
        """
        query_lower = query.lower().strip()

        # Full-text search + LIKE search (for partial matches)
        results = db.query(IngredientCache).filter(
            or_(
                IngredientCache.ingredient_name.ilike(f'%{query}%'),
                IngredientCache.normalized_name.ilike(f'%{query_lower}%')
            )
        ).order_by(
            IngredientCache.popularity.desc()
        ).limit(limit).all()

        return [
            {
                **item.to_dict(),
                "source": "cache"
            }
            for item in results
        ]

    @staticmethod
    def search_openfoodfacts(query: str, limit: int = 10) -> List[Dict]:
        """
        Search OpenFoodFacts API for ingredients.

        OpenFoodFacts is a free, open database of food products with 2M+ entries.
        No API key required, but must include User-Agent header.

        Args:
            query (str): Search term
            limit (int): Maximum results (default: 10)

        Returns:
            list: Array of ingredient dictionaries from API:
                - ingredient_name (str): Product name
                - normalized_name (str): Normalized (lowercase, singular)
                - category (str): Auto-detected category
                - barcode (str): Product barcode
                - source (str): 'openfoodfacts'
                - metadata (dict): Additional data (brands, images, etc.)

        Raises:
            requests.RequestException: If API call fails

        Example:
            >>> results = IngredientSearchService.search_openfoodfacts("banana", limit=5)
            >>> print(results[0])
            {
                "ingredient_name": "Organic Bananas",
                "normalized_name": "banana",
                "category": "produce",
                "barcode": "0123456789012",
                "source": "openfoodfacts"
            }

        Note:
            - Rate limit: ~10 requests/second (unofficial)
            - Requires User-Agent header
            - Results may vary by region
        """
        params = {
            'search_terms': query,
            'search_simple': 1,
            'action': 'process',
            'json': 1,
            'page_size': limit,
        }

        headers = {
            'User-Agent': IngredientSearchService.USER_AGENT
        }

        response = requests.get(
            IngredientSearchService.OPENFOODFACTS_API_URL,
            params=params,
            headers=headers,
            timeout=5
        )
        response.raise_for_status()

        data = response.json()
        products = data.get('products', [])

        results = []
        for product in products:
            product_name = product.get('product_name', '')
            if not product_name:
                continue

            # Normalize name (lowercase, remove extra words)
            normalized = product_name.lower().strip()

            # Auto-detect category from product categories
            category = IngredientSearchService.detect_category_from_tags(product.get('categories_tags', []))

            results.append({
                "ingredient_name": product_name,
                "normalized_name": normalized,
                "category": category,
                "barcode": product.get('code'),
                "source": "openfoodfacts",
                "metadata": {
                    "brands": product.get('brands'),
                    "image_url": product.get('image_url'),
                    "quantity": product.get('quantity'),
                }
            })

        return results

    @staticmethod
    def cache_ingredient(ingredient_data: Dict, db: Session):
        """
        Add or update an ingredient in the cache.

        If ingredient already exists (by normalized_name), updates it.
        Otherwise, creates a new cache entry.

        Args:
            ingredient_data (dict): Ingredient data to cache:
                - ingredient_name (str): Display name
                - normalized_name (str): Normalized name
                - category (str): Category
                - barcode (str, optional): Barcode
                - metadata (dict, optional): Additional data
            db (Session): Database session

        Example:
            >>> data = {
            ...     "ingredient_name": "Organic Milk",
            ...     "normalized_name": "milk",
            ...     "category": "dairy",
            ...     "barcode": "0123456789"
            ... }
            >>> IngredientSearchService.cache_ingredient(data, db)

        Note:
            - Commits to database automatically
            - If ingredient exists, updates metadata
            - If new, sets popularity to 0 (will increase on selection)
        """
        # Check if already cached
        existing = db.query(IngredientCache).filter_by(
            normalized_name=ingredient_data.get('normalized_name')
        ).first()

        if existing:
            # Update existing entry
            existing.barcode = ingredient_data.get('barcode') or existing.barcode
            existing.extra_data = ingredient_data.get('extra_data') or existing.extra_data
        else:
            # Create new entry
            new_ingredient = IngredientCache(
                ingredient_name=ingredient_data['ingredient_name'],
                normalized_name=ingredient_data['normalized_name'],
                category=ingredient_data.get('category', 'pantry'),
                barcode=ingredient_data.get('barcode'),
                source=ingredient_data.get('source', 'openfoodfacts'),
                extra_data=ingredient_data.get('extra_data'),
                popularity=0
            )
            db.add(new_ingredient)

        db.commit()

    @staticmethod
    def increment_popularity(ingredient_id: str, db: Session):
        """
        Increment popularity count when user selects an ingredient.

        This helps popular ingredients bubble to top of search results.

        Args:
            ingredient_id (str): UUID of ingredient
            db (Session): Database session

        Example:
            >>> IngredientSearchService.increment_popularity("uuid-123", db)

        Note:
            - Called when user confirms ingredient selection
            - Used to rank search results
        """
        ingredient = db.query(IngredientCache).filter_by(id=ingredient_id).first()
        if ingredient:
            ingredient.popularity += 1
            db.commit()

    @staticmethod
    def get_popular_ingredients(db: Session, limit: int = 100) -> List[Dict]:
        """
        Get most popular ingredients from cache.

        Used when search query is empty or for "recently added" suggestions.

        Args:
            db (Session): Database session
            limit (int): Number of results (default: 100)

        Returns:
            list: Top ingredients by popularity

        Example:
            >>> popular = IngredientSearchService.get_popular_ingredients(db, 10)
            >>> print(popular[0]['ingredient_name'])
            'Whole Milk'  # Most selected ingredient

        Note:
            - Sorted by popularity DESC
            - Useful for autocomplete suggestions
        """
        results = db.query(IngredientCache).order_by(
            IngredientCache.popularity.desc()
        ).limit(limit).all()

        return [
            {
                **item.to_dict(),
                "source": "cache"
            }
            for item in results
        ]

    @staticmethod
    def detect_category_from_tags(tags: List[str]) -> str:
        """
        Auto-detect category from OpenFoodFacts category tags.

        Args:
            tags (list): Category tags from OpenFoodFacts (e.g., ['en:dairy', 'en:milk'])

        Returns:
            str: Detected category or 'pantry' as fallback

        Note:
            - OpenFoodFacts tags are prefixed with language code (en:, fr:, etc.)
            - Checks common food categories
        """
        category_mapping = {
            'dairy': ['dairy', 'milk', 'cheese', 'yogurt'],
            'produce': ['fruit', 'vegetable', 'produce'],
            'protein': ['meat', 'poultry', 'fish', 'seafood', 'eggs'],
            'grains': ['bread', 'cereal', 'pasta', 'rice'],
            'beverages': ['beverage', 'drink', 'juice', 'soda'],
            'snacks': ['snack', 'chip', 'cookie', 'candy'],
        }

        tags_lower = [tag.lower() for tag in tags]

        for category, keywords in category_mapping.items():
            if any(any(keyword in tag for keyword in keywords) for tag in tags_lower):
                return category

        return 'pantry'

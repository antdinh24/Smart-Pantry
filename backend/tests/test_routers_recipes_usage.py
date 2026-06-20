"""
test_routers_recipes_usage.py

PURPOSE:
    Tests for the usage-limit integration in POST /api/v1/recipes/generate.

    This endpoint was modified to:
      1. Check the monthly recipe generation limit BEFORE calling OpenAI
      2. Increment the counter ONLY when from_cache=False (real GPT-4o call)
      3. Leave the counter unchanged when from_cache=True (cache hit — free)
      4. Re-raise HTTP 429 without wrapping it in a 500

    These tests cover exactly those four behaviors. The underlying recipe
    generation logic (RecipeService) is mocked — its correctness is covered
    separately by unit tests in tests/unit/test_recipes.py.

WHAT'S NOT TESTED HERE:
    - The actual recipe content or format (covered in unit/test_recipes.py)
    - The cache similarity algorithm (covered in unit/test_recipes.py)
    - General recipe CRUD endpoints (those were already tested)

HOW SERVICES ARE MOCKED:
    - UsageService.check_recipe_limit → no-op (passes) or raises 429
    - RecipeService.generate_or_find_recipe → returns CACHE_HIT_RESULT or FRESH_RESULT
    - UsageService.increment_recipe_generations → tracked for call count

    The DB dependency is overridden with a mock session via dependency_overrides.
"""

import pytest
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient
from fastapi import HTTPException, status

from app.main import app
from app.database import get_db


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

GENERATE_URL = "/api/v1/recipes/generate"

# A minimal valid request body — at least one ingredient is required
VALID_REQUEST = {"ingredients": ["tomato", "pasta", "cheese"]}

# What RecipeService returns when the result came from the shared cache (free)
CACHE_HIT_RESULT = {
    "from_cache": True,
    "cache_similarity": 0.95,
    "api_call_saved": True,
    "message": "Found a similar recipe in the cache.",
    "recipe": {
        "id": "recipe-cache-001",
        "user_id": None,
        "title": "Pasta Marinara",
        "description": "Classic tomato pasta",
        "ingredient_list": [{"name": "pasta", "quantity": "400g", "unit": "g"}],
        "instructions": [{"step": 1, "text": "Boil pasta"}],
        "prep_time_minutes": 10,
        "cook_time_minutes": 15,
        "servings": 4,
        "difficulty": "easy",
        "cuisine_type": "Italian",
        "meal_type": "dinner",
        "is_ai_generated": True,
        "nutritional_info": None,
        "is_public": True,
        "usage_count": 42,
        "created_at": "2025-01-01T00:00:00",
        "updated_at": "2025-01-01T00:00:00",
    },
}

# What RecipeService returns when GPT-4o was actually called (costs money)
FRESH_RESULT = {
    **CACHE_HIT_RESULT,
    "from_cache": False,
    "cache_similarity": 0.3,
    "api_call_saved": False,
    "message": "Generated a new recipe.",
}


# ─────────────────────────────────────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db():
    return Mock()


@pytest.fixture
def override_db(mock_db):
    app.dependency_overrides[get_db] = lambda: mock_db
    yield mock_db
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: usage limit gate
# ─────────────────────────────────────────────────────────────────────────────

class TestRecipeGenerationLimit:
    """Tests that the 429 limit gate works for recipe generation."""

    @patch("app.routers.recipes.UsageService.increment_recipe_generations")
    @patch("app.routers.recipes.RecipeService.generate_or_find_recipe")
    @patch("app.routers.recipes.UsageService.check_recipe_limit")
    def test_returns_429_when_limit_reached(
        self,
        mock_check,
        mock_generate,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        When check_recipe_limit raises 429, the endpoint must return 429
        to the client. The `except HTTPException: raise` in the router
        ensures it is not caught and re-raised as 500.
        """
        mock_check.side_effect = HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You've used all 10 free recipe generations this month.",
        )

        response = client.post(GENERATE_URL, json=VALID_REQUEST, headers=auth_headers)

        assert response.status_code == 429

    @patch("app.routers.recipes.UsageService.increment_recipe_generations")
    @patch("app.routers.recipes.RecipeService.generate_or_find_recipe")
    @patch("app.routers.recipes.UsageService.check_recipe_limit")
    def test_generate_not_called_when_limit_reached(
        self,
        mock_check,
        mock_generate,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        If the user is at their limit, generate_or_find_recipe must NOT be
        called — no OpenAI call should be made.
        """
        mock_check.side_effect = HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Limit reached",
        )

        client.post(GENERATE_URL, json=VALID_REQUEST, headers=auth_headers)

        mock_generate.assert_not_called()

    @patch("app.routers.recipes.UsageService.increment_recipe_generations")
    @patch("app.routers.recipes.RecipeService.generate_or_find_recipe")
    @patch("app.routers.recipes.UsageService.check_recipe_limit")
    def test_increment_not_called_when_limit_reached(
        self,
        mock_check,
        mock_generate,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        Increment must not be called when the request is blocked by the limit.
        """
        mock_check.side_effect = HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Limit reached",
        )

        client.post(GENERATE_URL, json=VALID_REQUEST, headers=auth_headers)

        mock_increment.assert_not_called()

    @patch("app.routers.recipes.UsageService.increment_recipe_generations")
    @patch("app.routers.recipes.RecipeService.generate_or_find_recipe")
    @patch("app.routers.recipes.UsageService.check_recipe_limit")
    def test_429_detail_is_preserved(
        self,
        mock_check,
        mock_generate,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        The 429 response detail from UsageService must reach the client
        unchanged — not replaced with a generic "Recipe generation failed" message.
        The frontend displays this detail directly to the user.
        """
        expected_detail = "You've used all 10 free recipe generations this month."
        mock_check.side_effect = HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=expected_detail,
        )

        response = client.post(GENERATE_URL, json=VALID_REQUEST, headers=auth_headers)

        assert expected_detail in response.json().get("detail", "")


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: counter increment behavior
# ─────────────────────────────────────────────────────────────────────────────

class TestRecipeGenerationCounter:
    """
    Tests that the generation counter is incremented correctly.

    The key rule: increment ONLY when from_cache=False.
    Cache hits are free and must never touch the counter.
    """

    @patch("app.routers.recipes.UsageService.increment_recipe_generations")
    @patch("app.routers.recipes.RecipeService.generate_or_find_recipe", return_value=FRESH_RESULT)
    @patch("app.routers.recipes.UsageService.check_recipe_limit")
    def test_counter_incremented_when_not_from_cache(
        self,
        mock_check,
        mock_generate,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        When generate_or_find_recipe returns from_cache=False, the counter
        must be incremented exactly once — a real OpenAI call was made.
        """
        response = client.post(GENERATE_URL, json=VALID_REQUEST, headers=auth_headers)

        assert response.status_code == 200
        mock_increment.assert_called_once()

    @patch("app.routers.recipes.UsageService.increment_recipe_generations")
    @patch("app.routers.recipes.RecipeService.generate_or_find_recipe", return_value=CACHE_HIT_RESULT)
    @patch("app.routers.recipes.UsageService.check_recipe_limit")
    def test_counter_not_incremented_on_cache_hit(
        self,
        mock_check,
        mock_generate,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        CRITICAL: when from_cache=True, the counter must NOT be incremented.

        A cache hit means no OpenAI call was made and no cost was incurred.
        Incrementing the counter for a cache hit would incorrectly penalize
        the user's free quota for a free operation.
        """
        response = client.post(GENERATE_URL, json=VALID_REQUEST, headers=auth_headers)

        assert response.status_code == 200
        mock_increment.assert_not_called()

    @patch("app.routers.recipes.UsageService.increment_recipe_generations")
    @patch("app.routers.recipes.RecipeService.generate_or_find_recipe", return_value=FRESH_RESULT)
    @patch("app.routers.recipes.UsageService.check_recipe_limit")
    def test_returns_200_with_from_cache_false(
        self,
        mock_check,
        mock_generate,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        A successful fresh generation (from_cache=False) should return 200
        with the recipe and cache metadata.
        """
        response = client.post(GENERATE_URL, json=VALID_REQUEST, headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["from_cache"] is False
        assert data["api_call_saved"] is False
        assert data["recipe"]["title"] == "Pasta Marinara"

    @patch("app.routers.recipes.UsageService.increment_recipe_generations")
    @patch("app.routers.recipes.RecipeService.generate_or_find_recipe", return_value=CACHE_HIT_RESULT)
    @patch("app.routers.recipes.UsageService.check_recipe_limit")
    def test_returns_200_with_from_cache_true(
        self,
        mock_check,
        mock_generate,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        A cache hit (from_cache=True) should also return 200 with the cached
        recipe and from_cache=True in the response body.
        """
        response = client.post(GENERATE_URL, json=VALID_REQUEST, headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["from_cache"] is True
        assert data["api_call_saved"] is True


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: authentication and validation
# ─────────────────────────────────────────────────────────────────────────────

class TestRecipeGenerationAuth:
    """Tests that the generate endpoint requires authentication."""

    def test_returns_403_without_auth(self, client, override_db):
        """No auth token → 403."""
        response = client.post(GENERATE_URL, json=VALID_REQUEST)
        assert response.status_code in (401, 403)

    def test_returns_422_with_empty_ingredients(self, client, override_db, auth_headers):
        """
        The GenerateRecipeRequest schema requires at least one ingredient
        (min_items=1). An empty list should return 422 before hitting any service.
        """
        response = client.post(
            GENERATE_URL,
            json={"ingredients": []},
            headers=auth_headers,
        )
        assert response.status_code == 422

    def test_returns_422_without_ingredients_field(self, client, override_db, auth_headers):
        """ingredients is a required field — omitting it returns 422."""
        response = client.post(GENERATE_URL, json={}, headers=auth_headers)
        assert response.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: service failure
# ─────────────────────────────────────────────────────────────────────────────

class TestRecipeGenerationFailure:
    """Tests that unexpected errors from RecipeService return 500."""

    @patch("app.routers.recipes.UsageService.increment_recipe_generations")
    @patch("app.routers.recipes.RecipeService.generate_or_find_recipe")
    @patch("app.routers.recipes.UsageService.check_recipe_limit")
    def test_returns_500_when_service_raises(
        self,
        mock_check,
        mock_generate,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        If generate_or_find_recipe raises a non-HTTP exception, the endpoint
        should return 500 with a user-facing error message.
        """
        mock_generate.side_effect = Exception("OpenAI API error: 503")

        response = client.post(GENERATE_URL, json=VALID_REQUEST, headers=auth_headers)

        assert response.status_code == 500

    @patch("app.routers.recipes.UsageService.increment_recipe_generations")
    @patch("app.routers.recipes.RecipeService.generate_or_find_recipe")
    @patch("app.routers.recipes.UsageService.check_recipe_limit")
    def test_increment_not_called_when_service_fails(
        self,
        mock_check,
        mock_generate,
        mock_increment,
        client,
        override_db,
        auth_headers,
    ):
        """
        If the service raises before returning a result, the counter must
        not be incremented — the generation did not complete.
        """
        mock_generate.side_effect = Exception("OpenAI API error: 503")

        client.post(GENERATE_URL, json=VALID_REQUEST, headers=auth_headers)

        mock_increment.assert_not_called()

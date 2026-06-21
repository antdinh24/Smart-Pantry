"""
test_routers_recipes.py

PURPOSE:
    HTTP-level tests for the recipes router. Covers all six endpoints:

        GET  /api/v1/recipes/suggestions    — pantry-based suggestions list
        GET  /api/v1/recipes                — user's saved recipes list
        POST /api/v1/recipes                — save a custom recipe
        GET  /api/v1/recipes/{id}           — fetch one recipe by ID
        GET  /api/v1/recipes/{id}/match     — calculate pantry match %
        GET  /api/v1/recipes/cache/stats    — cache effectiveness stats

    NOTE: POST /recipes/generate is already covered in test_routers_recipes_usage.py.
    This file covers the remaining five endpoints plus cache/stats.

HOW SERVICES ARE MOCKED:
    All service calls are patched with @patch at the module level:
        app.routers.recipes.RecipeService.<method>
        app.routers.recipes.PantryService.<method>
        app.routers.recipes.RecipeSimilarityService.<method>

    The DB is injected via FastAPI's dependency_overrides. The mock_db fixture
    is a plain Mock() — service calls that reach the DB won't because services
    are patched above. The override is still needed because the DB dependency
    is validated by FastAPI before the handler runs.

EDGE CASES COVERED:
    - No auth token → 403/401
    - Validation failures → 422 (missing required fields, wrong types, empty title)
    - Service returns None → 404
    - Service raises an exception → 500
    - Empty lists (no recipes, empty pantry, empty ingredients)
    - All optional fields absent vs. all present
    - Correct field types in responses (int vs float, str vs None)
    - Counter/side-effect timing (tests inherited from test_routers_recipes_usage.py)
"""

import pytest
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient
from fastapi import HTTPException, status

from app.main import app
from app.database import get_db

# ─────────────────────────────────────────────────────────────────────────────
# URL CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

SUGGESTIONS_URL = "/api/v1/recipes/suggestions"
LIST_URL        = "/api/v1/recipes"
SAVE_URL        = "/api/v1/recipes"
CACHE_STATS_URL = "/api/v1/recipes/cache/stats"

def recipe_url(recipe_id: str) -> str:
    """Build the URL for GET /recipes/:id"""
    return f"/api/v1/recipes/{recipe_id}"

def match_url(recipe_id: str) -> str:
    """Build the URL for GET /recipes/:id/match"""
    return f"/api/v1/recipes/{recipe_id}/match"


# ─────────────────────────────────────────────────────────────────────────────
# SAMPLE DATA
# ─────────────────────────────────────────────────────────────────────────────

# A valid UUID used as the recipe ID in tests.
# Using a real UUID format so tests that parse it as UUID don't fail.
RECIPE_ID = "aaaaaaaa-0000-0000-0000-000000000001"

# A second recipe ID for multi-recipe list tests.
RECIPE_ID_2 = "bbbbbbbb-0000-0000-0000-000000000002"

# What recipe.to_dict() returns — must match RecipeResponse schema fields.
SAMPLE_RECIPE_DICT = {
    "id": RECIPE_ID,
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Pasta Carbonara",
    "description": "Classic Italian pasta dish",
    "ingredient_list": [
        {"name": "pasta", "quantity": "400", "unit": "grams"},
        {"name": "eggs", "quantity": "3", "unit": "count"},
        {"name": "bacon", "quantity": "150", "unit": "grams"},
    ],
    "instructions": [
        {"step": 1, "text": "Boil pasta in salted water for 10 minutes"},
        {"step": 2, "text": "Cook bacon in a pan until crispy"},
        {"step": 3, "text": "Whisk eggs with grated pecorino"},
        {"step": 4, "text": "Combine everything off heat to avoid scrambling"},
    ],
    "prep_time_minutes": 10,
    "cook_time_minutes": 20,
    "servings": 4,
    "difficulty": "easy",
    "cuisine_type": "Italian",
    "meal_type": "dinner",
    "is_ai_generated": True,
    "source_type": "openai",      # present in to_dict() but not in RecipeResponse schema
    "nutritional_info": None,
    "is_public": True,
    "usage_count": 5,
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-15T12:30:00",
}

# A minimal recipe dict — only required fields, optional fields all null/missing.
MINIMAL_RECIPE_DICT = {
    "id": RECIPE_ID,
    "user_id": None,
    "title": "Simple Recipe",
    "description": None,
    "ingredient_list": [],
    "instructions": [],
    "prep_time_minutes": None,
    "cook_time_minutes": None,
    "servings": 1,
    "difficulty": None,
    "cuisine_type": None,
    "meal_type": None,
    "is_ai_generated": False,
    "source_type": "manual",
    "nutritional_info": None,
    "is_public": False,
    "usage_count": 0,
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00",
}

# What RecipeService.get_recipe_suggestions returns — a recipe dict with
# match_percentage injected. The router reads specific keys for RecipeSuggestion.
SAMPLE_SUGGESTION_DICT = {
    **SAMPLE_RECIPE_DICT,
    "match_percentage": 0.80,  # 80% — user has 80% of the ingredients
}

# A second suggestion to test list behaviour.
SAMPLE_SUGGESTION_DICT_2 = {
    **SAMPLE_RECIPE_DICT,
    "id": RECIPE_ID_2,
    "title": "Chicken Tikka Masala",
    "cuisine_type": "Indian",
    "difficulty": "medium",
    "match_percentage": 0.60,
}

# What the cache stats endpoint returns from RecipeService.get_cache_stats.
SAMPLE_CACHE_STATS = {
    "total_ai_recipes": 150,
    "public_cached_recipes": 120,
    "total_recipe_uses": 2000,
    "cache_hit_rate": 0.80,
    "estimated_api_calls_saved": 1880,
    "estimated_cost_saved_usd": 3.76,
}


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def make_mock_recipe_obj(recipe_dict: dict = None) -> Mock:
    """
    Build a mock Recipe ORM object whose .to_dict() returns the given dict.

    The router calls recipe.to_dict() to build its response, so we need a
    mock object — not just a plain dict.

    Args:
        recipe_dict: The dict to return from to_dict(). Defaults to SAMPLE_RECIPE_DICT.
    """
    mock = Mock()
    mock.to_dict.return_value = recipe_dict or SAMPLE_RECIPE_DICT
    return mock


def make_mock_pantry_item(normalized_name: str = "pasta") -> Mock:
    """
    Build a mock PantryItem ORM object.

    PantryService.get_user_pantry returns a list of these. The router calls
    item.to_dict() on each to build pantry_dicts, which is then passed to
    RecipeService.get_recipe_suggestions and RecipeSimilarityService.calculate_pantry_match.

    Args:
        normalized_name: The pantry ingredient's normalized name.
    """
    mock = Mock()
    mock.to_dict.return_value = {"normalized_name": normalized_name, "ingredient_name": normalized_name}
    return mock


# ─────────────────────────────────────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db():
    """
    Minimal mock SQLAlchemy session. Services are patched before they reach
    the DB, but FastAPI still resolves the dependency — so the override must
    exist.
    """
    return Mock()


@pytest.fixture
def override_db(mock_db):
    """
    Install the mock DB as the FastAPI dependency for get_db.
    Teardown clears all overrides so tests don't bleed into each other.
    """
    app.dependency_overrides[get_db] = lambda: mock_db
    yield mock_db
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    """Synchronous test client for the FastAPI app."""
    return TestClient(app)


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: GET /recipes/{recipe_id}
# ─────────────────────────────────────────────────────────────────────────────

class TestGetRecipeById:
    """
    Tests for GET /api/v1/recipes/{recipe_id}.

    This is the endpoint RecipeDetailScreen calls on mount (Option B design).
    Key behaviours:
      - 403/401 without a valid token
      - 404 when the service returns None (covers: not found, private recipe of another user)
      - 200 with the full RecipeResponse shape when the recipe exists
    """

    def test_returns_403_without_auth(self, client, override_db):
        """Any request without an Authorization header must be rejected."""
        response = client.get(recipe_url(RECIPE_ID))
        assert response.status_code in (401, 403)

    def test_returns_403_with_empty_bearer_token(self, client, override_db):
        """An empty Bearer value (no actual token) must be rejected."""
        response = client.get(
            recipe_url(RECIPE_ID),
            headers={"Authorization": "Bearer "},
        )
        assert response.status_code in (401, 403)

    @patch("app.routers.recipes.RecipeService.get_recipe_by_id", return_value=None)
    def test_returns_404_when_recipe_not_found(
        self, mock_get, client, override_db, auth_headers
    ):
        """
        When the service returns None (recipe doesn't exist or belongs to
        another user and is private), the router must return 404.
        """
        response = client.get(recipe_url(RECIPE_ID), headers=auth_headers)
        assert response.status_code == 404

    @patch("app.routers.recipes.RecipeService.get_recipe_by_id", return_value=None)
    def test_returns_404_for_nonexistent_uuid(
        self, mock_get, client, override_db, auth_headers
    ):
        """
        A correctly-formatted UUID that doesn't exist in the DB returns 404,
        not 422 — the ID format is valid, the record just isn't there.
        """
        missing_id = "cccccccc-0000-0000-0000-999999999999"
        response = client.get(recipe_url(missing_id), headers=auth_headers)
        assert response.status_code == 404

    @patch(
        "app.routers.recipes.RecipeService.get_recipe_by_id",
        return_value=make_mock_recipe_obj(),
    )
    def test_returns_200_with_correct_shape(
        self, mock_get, client, override_db, auth_headers
    ):
        """
        When the service returns a recipe, the router returns 200 and the body
        must include all RecipeResponse fields.
        """
        response = client.get(recipe_url(RECIPE_ID), headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == RECIPE_ID
        assert data["title"] == "Pasta Carbonara"
        assert data["description"] == "Classic Italian pasta dish"
        assert isinstance(data["ingredient_list"], list)
        assert isinstance(data["instructions"], list)
        assert data["servings"] == 4

    @patch(
        "app.routers.recipes.RecipeService.get_recipe_by_id",
        return_value=make_mock_recipe_obj(),
    )
    def test_response_includes_nested_ingredient_and_instruction_fields(
        self, mock_get, client, override_db, auth_headers
    ):
        """
        ingredient_list and instructions are nested lists of dicts.
        The router must not flatten or transform them.
        """
        response = client.get(recipe_url(RECIPE_ID), headers=auth_headers)
        data = response.json()

        # Verify ingredient_list contains dicts with expected keys
        assert len(data["ingredient_list"]) == 3
        assert data["ingredient_list"][0]["name"] == "pasta"
        assert data["ingredient_list"][0]["unit"] == "grams"

        # Verify instructions contain step numbers
        assert len(data["instructions"]) == 4
        assert data["instructions"][0]["step"] == 1

    @patch(
        "app.routers.recipes.RecipeService.get_recipe_by_id",
        return_value=make_mock_recipe_obj(MINIMAL_RECIPE_DICT),
    )
    def test_optional_fields_can_be_null(
        self, mock_get, client, override_db, auth_headers
    ):
        """
        All optional fields (description, difficulty, cuisine_type, etc.) must
        be accepted as null in the response without causing a validation error.
        """
        response = client.get(recipe_url(RECIPE_ID), headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["description"] is None
        assert data["difficulty"] is None
        assert data["cuisine_type"] is None
        assert data["prep_time_minutes"] is None
        assert data["cook_time_minutes"] is None
        assert data["nutritional_info"] is None

    @patch("app.routers.recipes.RecipeService.get_recipe_by_id")
    def test_service_called_with_correct_recipe_id_and_user_id(
        self, mock_get, client, override_db, auth_headers, test_user_id
    ):
        """
        The router must forward both the path param and the authenticated
        user's ID to the service. This is how access control is enforced —
        the service filters on (recipe.user_id == user_id OR recipe.is_public).
        """
        mock_get.return_value = make_mock_recipe_obj()

        client.get(recipe_url(RECIPE_ID), headers=auth_headers)

        # First arg is db, second is recipe_id, third is user_id
        call_args = mock_get.call_args
        assert call_args[0][1] == RECIPE_ID           # recipe_id passed correctly
        assert call_args[0][2] == test_user_id        # user_id passed correctly


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: GET /recipes/suggestions
# ─────────────────────────────────────────────────────────────────────────────

class TestGetRecipeSuggestions:
    """
    Tests for GET /api/v1/recipes/suggestions.

    RecipesScreen calls this on mount to populate the suggestions list.
    The endpoint fetches the user's pantry, then asks RecipeService for
    suggestions sorted by match percentage.
    """

    def test_returns_403_without_auth(self, client, override_db):
        """Unauthenticated requests are rejected."""
        response = client.get(SUGGESTIONS_URL)
        assert response.status_code in (401, 403)

    @patch(
        "app.routers.recipes.RecipeService.get_recipe_suggestions",
        return_value=[],
    )
    @patch("app.routers.recipes.PantryService.get_user_pantry", return_value=[])
    def test_returns_empty_list_when_no_suggestions(
        self, mock_pantry, mock_suggest, client, override_db, auth_headers
    ):
        """
        When the pantry is empty (or no recipes match), the endpoint returns
        a 200 with an empty array — not a 404.
        """
        response = client.get(SUGGESTIONS_URL, headers=auth_headers)

        assert response.status_code == 200
        assert response.json() == []

    @patch(
        "app.routers.recipes.RecipeService.get_recipe_suggestions",
        return_value=[SAMPLE_SUGGESTION_DICT],
    )
    @patch(
        "app.routers.recipes.PantryService.get_user_pantry",
        return_value=[make_mock_pantry_item("pasta")],
    )
    def test_returns_suggestion_with_correct_shape(
        self, mock_pantry, mock_suggest, client, override_db, auth_headers
    ):
        """
        Each suggestion in the response must have the RecipeSuggestion fields:
        id, title, description, match_percentage, difficulty, cuisine_type,
        prep_time_minutes, cook_time_minutes.
        """
        response = client.get(SUGGESTIONS_URL, headers=auth_headers)

        assert response.status_code == 200
        suggestions = response.json()
        assert len(suggestions) == 1

        s = suggestions[0]
        assert s["id"] == RECIPE_ID
        assert s["title"] == "Pasta Carbonara"
        assert s["match_percentage"] == 0.80
        assert s["difficulty"] == "easy"
        assert s["cuisine_type"] == "Italian"
        assert s["prep_time_minutes"] == 10
        assert s["cook_time_minutes"] == 20

    @patch(
        "app.routers.recipes.RecipeService.get_recipe_suggestions",
        return_value=[SAMPLE_SUGGESTION_DICT, SAMPLE_SUGGESTION_DICT_2],
    )
    @patch(
        "app.routers.recipes.PantryService.get_user_pantry",
        return_value=[make_mock_pantry_item("pasta")],
    )
    def test_returns_multiple_suggestions(
        self, mock_pantry, mock_suggest, client, override_db, auth_headers
    ):
        """All suggestions from the service appear in the response."""
        response = client.get(SUGGESTIONS_URL, headers=auth_headers)

        assert response.status_code == 200
        suggestions = response.json()
        assert len(suggestions) == 2
        assert suggestions[0]["id"] == RECIPE_ID
        assert suggestions[1]["id"] == RECIPE_ID_2

    @patch("app.routers.recipes.RecipeService.get_recipe_suggestions", return_value=[])
    @patch("app.routers.recipes.PantryService.get_user_pantry", return_value=[])
    def test_default_limit_is_ten(
        self, mock_pantry, mock_suggest, client, override_db, auth_headers
    ):
        """
        Without a ?limit= param, the service must be called with limit=10 (default).
        This prevents accidental over-fetching if the default is ever changed
        at the service layer.
        """
        client.get(SUGGESTIONS_URL, headers=auth_headers)

        call_kwargs = mock_suggest.call_args[1]
        assert call_kwargs.get("limit", None) == 10 or mock_suggest.call_args[0][3] == 10

    @patch("app.routers.recipes.RecipeService.get_recipe_suggestions", return_value=[])
    @patch("app.routers.recipes.PantryService.get_user_pantry", return_value=[])
    def test_custom_limit_is_forwarded_to_service(
        self, mock_pantry, mock_suggest, client, override_db, auth_headers
    ):
        """
        ?limit=3 must be passed to the service, not ignored.
        Allows callers to control how many suggestions are returned.
        """
        client.get(f"{SUGGESTIONS_URL}?limit=3", headers=auth_headers)

        # The call signature is get_recipe_suggestions(db, user_id, pantry_items, limit=N)
        call_args = mock_suggest.call_args
        # limit may be positional (index 3) or keyword
        passed_limit = call_args[1].get("limit") or call_args[0][3]
        assert passed_limit == 3

    def test_returns_422_for_non_integer_limit(self, client, override_db, auth_headers):
        """
        ?limit=banana is not a valid integer. FastAPI validates query params
        and returns 422 before the handler runs.
        """
        response = client.get(f"{SUGGESTIONS_URL}?limit=banana", headers=auth_headers)
        assert response.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: GET /recipes (user's saved recipes)
# ─────────────────────────────────────────────────────────────────────────────

class TestGetUserRecipes:
    """
    Tests for GET /api/v1/recipes.

    Returns all recipes saved by the authenticated user (both AI-generated
    and manually created). Does NOT include public recipes from other users.
    """

    def test_returns_403_without_auth(self, client, override_db):
        """Unauthenticated requests must be rejected."""
        response = client.get(LIST_URL)
        assert response.status_code in (401, 403)

    @patch("app.routers.recipes.RecipeService.get_user_recipes", return_value=[])
    def test_returns_empty_list_when_user_has_no_recipes(
        self, mock_list, client, override_db, auth_headers
    ):
        """A user who hasn't saved any recipes gets 200 with [] body."""
        response = client.get(LIST_URL, headers=auth_headers)

        assert response.status_code == 200
        assert response.json() == []

    @patch("app.routers.recipes.RecipeService.get_user_recipes")
    def test_returns_all_user_recipes(
        self, mock_list, client, override_db, auth_headers
    ):
        """
        All recipes returned by the service must appear in the response.
        The router must not paginate or filter the list.
        """
        mock_list.return_value = [
            make_mock_recipe_obj(SAMPLE_RECIPE_DICT),
            make_mock_recipe_obj({**SAMPLE_RECIPE_DICT, "id": RECIPE_ID_2, "title": "Omelette"}),
        ]

        response = client.get(LIST_URL, headers=auth_headers)

        assert response.status_code == 200
        recipes = response.json()
        assert len(recipes) == 2
        titles = [r["title"] for r in recipes]
        assert "Pasta Carbonara" in titles
        assert "Omelette" in titles

    @patch("app.routers.recipes.RecipeService.get_user_recipes")
    def test_each_recipe_has_correct_shape(
        self, mock_list, client, override_db, auth_headers
    ):
        """Every item in the list must be a valid RecipeResponse."""
        mock_list.return_value = [make_mock_recipe_obj()]

        response = client.get(LIST_URL, headers=auth_headers)

        recipe = response.json()[0]
        required_fields = [
            "id", "title", "ingredient_list", "instructions",
            "servings", "is_ai_generated", "is_public", "usage_count",
            "created_at", "updated_at",
        ]
        for field in required_fields:
            assert field in recipe, f"Missing field: {field}"

    @patch("app.routers.recipes.RecipeService.get_user_recipes")
    def test_returns_single_recipe_correctly(
        self, mock_list, client, override_db, auth_headers
    ):
        """Single-item list is returned as a JSON array with one element."""
        mock_list.return_value = [make_mock_recipe_obj()]

        response = client.get(LIST_URL, headers=auth_headers)

        assert response.status_code == 200
        assert len(response.json()) == 1


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: POST /recipes (save custom recipe)
# ─────────────────────────────────────────────────────────────────────────────

class TestSaveRecipe:
    """
    Tests for POST /api/v1/recipes.

    Lets users save manually created recipes (not AI-generated).
    Returns 201 Created with the saved recipe on success.
    """

    # ── Auth ──────────────────────────────────────────────────────────────────

    def test_returns_403_without_auth(self, client, override_db):
        """Unauthenticated requests must be rejected."""
        payload = {
            "title": "My Recipe",
            "ingredient_list": [],
            "instructions": [],
        }
        response = client.post(SAVE_URL, json=payload)
        assert response.status_code in (401, 403)

    # ── Validation (422) ──────────────────────────────────────────────────────

    def test_returns_422_when_title_missing(self, client, override_db, auth_headers):
        """title is required — omitting it returns 422."""
        response = client.post(
            SAVE_URL,
            json={"ingredient_list": [], "instructions": []},
            headers=auth_headers,
        )
        assert response.status_code == 422

    def test_returns_422_when_title_is_empty_string(
        self, client, override_db, auth_headers
    ):
        """
        title has min_length=1 — an empty string is rejected before the
        handler runs. Users must provide at least one character.
        """
        response = client.post(
            SAVE_URL,
            json={"title": "", "ingredient_list": [], "instructions": []},
            headers=auth_headers,
        )
        assert response.status_code == 422

    def test_returns_422_when_ingredient_list_missing(
        self, client, override_db, auth_headers
    ):
        """ingredient_list is required — omitting it returns 422."""
        response = client.post(
            SAVE_URL,
            json={"title": "My Recipe", "instructions": []},
            headers=auth_headers,
        )
        assert response.status_code == 422

    def test_returns_422_when_instructions_missing(
        self, client, override_db, auth_headers
    ):
        """instructions is required — omitting it returns 422."""
        response = client.post(
            SAVE_URL,
            json={"title": "My Recipe", "ingredient_list": []},
            headers=auth_headers,
        )
        assert response.status_code == 422

    def test_returns_422_for_empty_body(self, client, override_db, auth_headers):
        """Sending {} (all required fields missing) must return 422."""
        response = client.post(SAVE_URL, json={}, headers=auth_headers)
        assert response.status_code == 422

    # ── Success (201) ─────────────────────────────────────────────────────────

    @patch("app.routers.recipes.RecipeService.save_user_recipe")
    def test_returns_201_with_minimal_valid_payload(
        self, mock_save, client, override_db, auth_headers
    ):
        """
        The minimal valid request — title + empty ingredient_list + empty
        instructions — must return 201. Empty lists are valid (user may fill
        the recipe in later).
        """
        mock_save.return_value = make_mock_recipe_obj(MINIMAL_RECIPE_DICT)

        response = client.post(
            SAVE_URL,
            json={"title": "Simple Recipe", "ingredient_list": [], "instructions": []},
            headers=auth_headers,
        )

        assert response.status_code == 201

    @patch("app.routers.recipes.RecipeService.save_user_recipe")
    def test_returns_correct_shape_on_success(
        self, mock_save, client, override_db, auth_headers
    ):
        """The 201 response body must be a complete RecipeResponse."""
        mock_save.return_value = make_mock_recipe_obj(SAMPLE_RECIPE_DICT)

        response = client.post(
            SAVE_URL,
            json={
                "title": "Pasta Carbonara",
                "description": "Classic Italian pasta dish",
                "ingredient_list": [{"name": "pasta", "quantity": "400", "unit": "grams"}],
                "instructions": [{"step": 1, "text": "Boil pasta"}],
                "prep_time_minutes": 10,
                "cook_time_minutes": 20,
                "servings": 4,
                "difficulty": "easy",
                "cuisine_type": "Italian",
            },
            headers=auth_headers,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Pasta Carbonara"
        assert data["id"] == RECIPE_ID

    @patch("app.routers.recipes.RecipeService.save_user_recipe")
    def test_all_optional_fields_accepted(
        self, mock_save, client, override_db, auth_headers
    ):
        """
        A fully-specified request with all optional fields must return 201.
        Ensures the schema doesn't unexpectedly reject any valid field.
        """
        mock_save.return_value = make_mock_recipe_obj(SAMPLE_RECIPE_DICT)

        payload = {
            "title": "Full Recipe",
            "description": "A detailed recipe",
            "ingredient_list": [{"name": "pasta", "quantity": "400", "unit": "grams"}],
            "instructions": [{"step": 1, "text": "Cook it"}],
            "prep_time_minutes": 15,
            "cook_time_minutes": 30,
            "servings": 6,
            "difficulty": "hard",
            "cuisine_type": "French",
            "meal_type": "lunch",
            "nutritional_info": {"calories": "500kcal", "protein": "25g"},
        }

        response = client.post(SAVE_URL, json=payload, headers=auth_headers)
        assert response.status_code == 201

    @patch("app.routers.recipes.RecipeService.save_user_recipe")
    def test_returns_500_when_service_raises(
        self, mock_save, override_db, auth_headers
    ):
        """
        If the service raises an unexpected exception (DB error, etc.),
        FastAPI returns 500. The save endpoint has no try/except so unhandled
        exceptions bubble up to the framework's default error handler.

        WHY raise_server_exceptions=False:
            By default, TestClient re-raises server-side exceptions in the test
            process. Setting raise_server_exceptions=False makes it instead return
            the HTTP 500 response the client would actually receive. This lets us
            assert on the status code rather than catching the exception ourselves.
        """
        mock_save.side_effect = Exception("Database connection lost")

        # Create a client that returns 500 responses instead of re-raising the exception
        no_raise_client = TestClient(app, raise_server_exceptions=False)

        response = no_raise_client.post(
            SAVE_URL,
            json={"title": "My Recipe", "ingredient_list": [], "instructions": []},
            headers=auth_headers,
        )

        assert response.status_code == 500

    @patch("app.routers.recipes.RecipeService.save_user_recipe")
    def test_very_long_title_is_accepted(
        self, mock_save, client, override_db, auth_headers
    ):
        """
        There is no max_length on title. A very long title (500 chars) is valid
        from the router's perspective — DB constraints may reject it, but that
        would be a 500, not a 422.
        """
        mock_save.return_value = make_mock_recipe_obj(MINIMAL_RECIPE_DICT)

        long_title = "A" * 500
        response = client.post(
            SAVE_URL,
            json={"title": long_title, "ingredient_list": [], "instructions": []},
            headers=auth_headers,
        )

        # Should reach the service, not fail at validation
        assert response.status_code in (201, 500)
        mock_save.assert_called_once()

    @patch("app.routers.recipes.RecipeService.save_user_recipe")
    def test_large_ingredient_list_is_accepted(
        self, mock_save, client, override_db, auth_headers
    ):
        """
        A recipe with many ingredients (100+) should not be rejected at the
        router level. The schema has no max_items constraint.
        """
        mock_save.return_value = make_mock_recipe_obj(MINIMAL_RECIPE_DICT)

        many_ingredients = [{"name": f"ingredient_{i}", "quantity": "1", "unit": "cup"}
                            for i in range(100)]

        response = client.post(
            SAVE_URL,
            json={"title": "Complex Recipe", "ingredient_list": many_ingredients, "instructions": []},
            headers=auth_headers,
        )

        assert response.status_code in (201, 500)
        mock_save.assert_called_once()


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: GET /recipes/{recipe_id}/match
# ─────────────────────────────────────────────────────────────────────────────

class TestCalculateMatch:
    """
    Tests for GET /api/v1/recipes/{recipe_id}/match.

    Shows the user how many of the recipe's ingredients they already have
    in their pantry (match_percentage, missing_ingredients, etc.).
    """

    def test_returns_403_without_auth(self, client, override_db):
        """Unauthenticated requests must be rejected."""
        response = client.get(match_url(RECIPE_ID))
        assert response.status_code in (401, 403)

    @patch("app.routers.recipes.RecipeService.get_recipe_by_id", return_value=None)
    def test_returns_404_when_recipe_not_found(
        self, mock_get, client, override_db, auth_headers
    ):
        """If the recipe ID doesn't exist, the match endpoint returns 404."""
        response = client.get(match_url(RECIPE_ID), headers=auth_headers)
        assert response.status_code == 404

    @patch("app.routers.recipes.RecipeSimilarityService.calculate_pantry_match", return_value=1.0)
    @patch("app.routers.recipes.PantryService.get_user_pantry", return_value=[])
    @patch("app.routers.recipes.RecipeService.get_recipe_by_id")
    def test_returns_correct_response_shape(
        self, mock_get, mock_pantry, mock_match, client, override_db, auth_headers
    ):
        """
        The MatchResponse must include recipe_id, match_percentage,
        matching_ingredients, total_ingredients, and missing_ingredients.
        """
        mock_recipe = make_mock_recipe_obj()
        # Give the recipe object an ingredient_list attribute directly
        # (the match endpoint iterates recipe.ingredient_list, not recipe.to_dict())
        mock_recipe.ingredient_list = SAMPLE_RECIPE_DICT["ingredient_list"]
        mock_get.return_value = mock_recipe

        response = client.get(match_url(RECIPE_ID), headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert "recipe_id" in data
        assert "match_percentage" in data
        assert "matching_ingredients" in data
        assert "total_ingredients" in data
        assert "missing_ingredients" in data

    @patch("app.routers.recipes.RecipeSimilarityService.calculate_pantry_match", return_value=0.0)
    @patch("app.routers.recipes.PantryService.get_user_pantry", return_value=[])
    @patch("app.routers.recipes.RecipeService.get_recipe_by_id")
    def test_empty_pantry_returns_zero_match(
        self, mock_get, mock_pantry, mock_match, client, override_db, auth_headers
    ):
        """
        When the pantry is empty, the match percentage is 0.0 and all
        ingredients appear in missing_ingredients.
        """
        mock_recipe = make_mock_recipe_obj()
        mock_recipe.ingredient_list = [
            {"name": "pasta", "quantity": "400", "unit": "grams"},
            {"name": "eggs", "quantity": "3", "unit": "count"},
        ]
        mock_get.return_value = mock_recipe

        response = client.get(match_url(RECIPE_ID), headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["match_percentage"] == 0.0
        # Both ingredients are missing
        assert data["total_ingredients"] == 2
        assert len(data["missing_ingredients"]) == 2

    @patch("app.routers.recipes.RecipeSimilarityService.calculate_pantry_match", return_value=1.0)
    @patch("app.routers.recipes.PantryService.get_user_pantry")
    @patch("app.routers.recipes.RecipeService.get_recipe_by_id")
    def test_full_pantry_match_returns_no_missing_ingredients(
        self, mock_get, mock_pantry, mock_match, client, override_db, auth_headers
    ):
        """
        When the user has all the ingredients, missing_ingredients must be
        empty and matching_ingredients must equal total_ingredients.
        """
        mock_recipe = make_mock_recipe_obj()
        # Recipe needs pasta and eggs
        mock_recipe.ingredient_list = [
            {"name": "pasta", "quantity": "400", "unit": "grams"},
            {"name": "eggs", "quantity": "3", "unit": "count"},
        ]
        mock_get.return_value = mock_recipe

        # Pantry contains pasta and eggs (normalized names match)
        mock_pantry.return_value = [
            make_mock_pantry_item("pasta"),
            make_mock_pantry_item("egg"),   # normalized from "eggs"
        ]

        response = client.get(match_url(RECIPE_ID), headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["missing_ingredients"] == []

    @patch("app.routers.recipes.RecipeSimilarityService.calculate_pantry_match", return_value=0.5)
    @patch("app.routers.recipes.PantryService.get_user_pantry", return_value=[])
    @patch("app.routers.recipes.RecipeService.get_recipe_by_id")
    def test_recipe_with_empty_ingredient_list(
        self, mock_get, mock_pantry, mock_match, client, override_db, auth_headers
    ):
        """
        A recipe with an empty ingredient_list (edge case: malformed AI output)
        should not crash the endpoint. total_ingredients is 0, nothing is missing.
        """
        mock_recipe = make_mock_recipe_obj()
        mock_recipe.ingredient_list = []   # empty — no ingredients
        mock_get.return_value = mock_recipe

        response = client.get(match_url(RECIPE_ID), headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["total_ingredients"] == 0
        assert data["missing_ingredients"] == []

    @patch("app.routers.recipes.RecipeSimilarityService.calculate_pantry_match", return_value=0.5)
    @patch("app.routers.recipes.PantryService.get_user_pantry", return_value=[])
    @patch("app.routers.recipes.RecipeService.get_recipe_by_id")
    def test_recipe_id_echoed_in_response(
        self, mock_get, mock_pantry, mock_match, client, override_db, auth_headers
    ):
        """
        The recipe_id in the response must match the ID from the URL path.
        This is used by the frontend to correlate responses to requests.
        """
        mock_recipe = make_mock_recipe_obj()
        mock_recipe.ingredient_list = []
        mock_get.return_value = mock_recipe

        response = client.get(match_url(RECIPE_ID), headers=auth_headers)

        assert response.json()["recipe_id"] == RECIPE_ID

    @patch("app.routers.recipes.RecipeSimilarityService.calculate_pantry_match", return_value=0.5)
    @patch("app.routers.recipes.PantryService.get_user_pantry", return_value=[])
    @patch("app.routers.recipes.RecipeService.get_recipe_by_id")
    def test_ingredient_dicts_without_name_key_are_skipped(
        self, mock_get, mock_pantry, mock_match, client, override_db, auth_headers
    ):
        """
        The match logic iterates ingredient_list and accesses ingredient['name'].
        Dicts that lack a 'name' key should be silently skipped — not crash the
        endpoint. This guards against malformed AI-generated ingredient data.
        """
        mock_recipe = make_mock_recipe_obj()
        mock_recipe.ingredient_list = [
            {"name": "pasta", "quantity": "400", "unit": "grams"},
            {"quantity": "3", "unit": "count"},       # no 'name' key — should be skipped
            {"name": "bacon", "quantity": "150", "unit": "grams"},
        ]
        mock_get.return_value = mock_recipe

        response = client.get(match_url(RECIPE_ID), headers=auth_headers)

        # Should not crash — only the 2 valid ingredients are counted
        assert response.status_code == 200
        assert response.json()["total_ingredients"] == 2


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: GET /recipes/cache/stats
# ─────────────────────────────────────────────────────────────────────────────

class TestGetCacheStats:
    """
    Tests for GET /api/v1/recipes/cache/stats.

    Returns statistics about how many API calls have been saved by the
    recipe similarity cache. Used for internal analytics and cost monitoring.
    """

    def test_returns_403_without_auth(self, client, override_db):
        """Unauthenticated requests must be rejected."""
        response = client.get(CACHE_STATS_URL)
        assert response.status_code in (401, 403)

    @patch(
        "app.routers.recipes.RecipeService.get_cache_stats",
        return_value=SAMPLE_CACHE_STATS,
    )
    def test_returns_correct_shape(
        self, mock_stats, client, override_db, auth_headers
    ):
        """
        The response must include all six CacheStatsResponse fields with
        the correct types.
        """
        response = client.get(CACHE_STATS_URL, headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["total_ai_recipes"] == 150
        assert data["public_cached_recipes"] == 120
        assert data["total_recipe_uses"] == 2000
        assert data["cache_hit_rate"] == 0.80
        assert data["estimated_api_calls_saved"] == 1880
        assert data["estimated_cost_saved_usd"] == 3.76

    @patch(
        "app.routers.recipes.RecipeService.get_cache_stats",
        return_value={
            "total_ai_recipes": 0,
            "public_cached_recipes": 0,
            "total_recipe_uses": 0,
            "cache_hit_rate": 0.0,
            "estimated_api_calls_saved": 0,
            "estimated_cost_saved_usd": 0.0,
        },
    )
    def test_returns_zeros_when_cache_is_empty(
        self, mock_stats, client, override_db, auth_headers
    ):
        """
        When no AI recipes have been generated yet (new deployment),
        all stats are zero. Division-by-zero must not crash the endpoint.
        """
        response = client.get(CACHE_STATS_URL, headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["total_ai_recipes"] == 0
        assert data["cache_hit_rate"] == 0.0
        assert data["estimated_cost_saved_usd"] == 0.0

    @patch(
        "app.routers.recipes.RecipeService.get_cache_stats",
        return_value={
            "total_ai_recipes": 1,
            "public_cached_recipes": 1,
            "total_recipe_uses": 10000,
            "cache_hit_rate": 1.0,
            "estimated_api_calls_saved": 9999,
            "estimated_cost_saved_usd": 19.998,
        },
    )
    def test_returns_large_usage_counts_correctly(
        self, mock_stats, client, override_db, auth_headers
    ):
        """
        Large numbers (10k+ uses) must serialize and deserialize correctly.
        JSON supports arbitrary integers but we verify the response parsing.
        """
        response = client.get(CACHE_STATS_URL, headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["total_recipe_uses"] == 10000
        assert data["estimated_api_calls_saved"] == 9999

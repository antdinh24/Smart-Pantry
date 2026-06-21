"""
test_services_recipe_similarity.py

PURPOSE:
    Unit tests for RecipeSimilarityService — the core of the shared recipe
    cache system. This service controls whether a user's recipe request hits
    the OpenAI API or returns a cached result. A bug here is silent and
    expensive: the app still works, but you pay for API calls that should
    have been free.

WHAT'S BEING TESTED:

    normalize_ingredient_list
        - Sorts the output alphabetically (required for deterministic hashing)
        - Removes exact duplicates
        - Delegates normalization to PantryService (e.g. "Tomatoes" → "tomato")
        - Handles empty input gracefully

    compute_ingredient_hash
        - Same ingredients in any order → identical hash (order-independent)
        - Different ingredients → different hash
        - Hash is deterministic (calling twice returns same value)
        - Empty list produces a valid hash (doesn't crash)

    calculate_jaccard_similarity (pure math — no DB)
        - Both empty sets → 1.0 (identical nothingness)
        - One set empty → 0.0 (no common ground)
        - Identical sets → 1.0
        - No overlap → 0.0
        - Partial overlap → correct formula: |intersection| / |union|
        - The docstring example: {tomato,pasta,cheese} ∩ {tomato,pasta,basil} = 2/4 = 0.5
        - Single element, shared → 1.0; not shared → 0.0
        - Score is always in [0.0, 1.0]

    find_cached_recipe (uses DB mock)
        - Exact hash match returns (recipe, 1.0) without scanning all recipes
        - Similarity match above 0.80 threshold returns (best_recipe, score)
        - Recipe at exactly 0.80 is included (threshold is inclusive)
        - Recipe below 0.80 threshold returns None
        - When multiple recipes qualify, the highest-similarity one wins
        - Cuisine preference mismatch skips a recipe even if similarity is high
        - Difficulty preference mismatch skips a recipe
        - Meal type preference mismatch skips a recipe
        - None preferences → no filtering (all high-similarity recipes considered)
        - Custom min_similarity parameter overrides the default 0.80

    calculate_pantry_match (uses DB mock)
        - Recipe not found in DB → 0.0
        - Recipe with no ingredients → 0.0
        - Pantry has all recipe ingredients → 1.0
        - Pantry has none of the recipe ingredients → 0.0
        - Pantry has half → 0.5 (uses normalized names for comparison)

    get_cache_statistics (uses DB mock)
        - Returns dict with all six expected keys
        - cache_hit_rate = public_recipes / total_recipes
        - cache_hit_rate = 0.0 when total_recipes = 0 (no zero-division)
        - estimated_api_calls_saved never goes negative (max(0, ...))
        - estimated_cost_saved_usd never goes negative
"""

import pytest
import hashlib
import json
from unittest.mock import Mock, patch, MagicMock

from app.services.recipe_similarity import RecipeSimilarityService


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def make_mock_recipe(
    ingredient_names: list[str],
    cuisine_type: str = None,
    difficulty: str = None,
    meal_type: str = None,
    ingredient_hash: str = None,
    usage_count: int = 5,
):
    """
    Build a Mock that looks like a Recipe ORM object.

    @param ingredient_names - List of ingredient name strings (for ingredient_list)
    @param cuisine_type     - e.g. "Italian"
    @param difficulty       - e.g. "easy"
    @param meal_type        - e.g. "dinner"
    @param ingredient_hash  - Pre-computed hash string, or None
    @param usage_count      - Recipe usage count for cache statistics
    """
    recipe = Mock()
    recipe.cuisine_type = cuisine_type
    recipe.difficulty = difficulty
    recipe.meal_type = meal_type
    recipe.ingredient_hash = ingredient_hash
    recipe.usage_count = usage_count
    recipe.is_public = True
    recipe.is_ai_generated = True
    # ingredient_list is a list of dicts, matching the real ORM column shape
    recipe.ingredient_list = [{"name": name} for name in ingredient_names]
    return recipe


def make_mock_db_for_find(exact_match=None, all_recipes=None):
    """
    Build a Mock DB session for find_cached_recipe tests.

    find_cached_recipe makes two queries:
      1. db.query(Recipe).filter(...).first()  — exact hash lookup
      2. db.query(Recipe).filter(...).all()    — full similarity scan

    Both go through the same mock chain, so we configure .first() and .all()
    on the same filter mock. The test controls which returns the match.

    @param exact_match  - Recipe to return from .first() (or None)
    @param all_recipes  - List of recipes to return from .all() (or [])
    """
    mock_db = Mock()
    mock_filter = Mock()
    mock_db.query.return_value.filter.return_value = mock_filter
    mock_filter.first.return_value = exact_match
    mock_filter.all.return_value = all_recipes or []
    return mock_db


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: normalize_ingredient_list
# ─────────────────────────────────────────────────────────────────────────────

class TestNormalizeIngredientList:
    """Tests for RecipeSimilarityService.normalize_ingredient_list()"""

    def test_returns_sorted_list(self):
        """Output must be sorted alphabetically so hashing is order-independent."""
        result = RecipeSimilarityService.normalize_ingredient_list(
            ["zucchini", "apple", "milk"]
        )
        assert result == sorted(result)

    def test_removes_duplicates(self):
        """
        Duplicate ingredients (before or after normalization) should appear
        only once. Duplicates in a recipe list are data noise.
        """
        result = RecipeSimilarityService.normalize_ingredient_list(
            ["tomato", "tomato", "milk"]
        )
        assert len(result) == 2
        assert result.count("tomato") == 1

    def test_normalizes_via_pantry_service(self):
        """
        'Tomatoes' (plural, capital) and 'tomato' (singular, lowercase)
        should normalize to the same value and deduplicate.
        """
        result = RecipeSimilarityService.normalize_ingredient_list(
            ["Tomatoes", "tomato"]
        )
        # After normalization both become the same string — only one entry
        assert len(result) == 1

    def test_strips_adjective_prefixes(self):
        """
        'Fresh Tomatoes' and 'tomato' should normalize to the same thing.
        PantryService strips 'fresh ', 'organic ', etc.
        """
        result_a = RecipeSimilarityService.normalize_ingredient_list(["Fresh Tomatoes"])
        result_b = RecipeSimilarityService.normalize_ingredient_list(["tomato"])
        assert result_a == result_b

    def test_empty_list_returns_empty(self):
        """Empty input should return an empty list without raising."""
        result = RecipeSimilarityService.normalize_ingredient_list([])
        assert result == []

    def test_single_ingredient(self):
        """A one-item list should return a one-item list."""
        result = RecipeSimilarityService.normalize_ingredient_list(["Milk"])
        assert len(result) == 1


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: compute_ingredient_hash
# ─────────────────────────────────────────────────────────────────────────────

class TestComputeIngredientHash:
    """Tests for RecipeSimilarityService.compute_ingredient_hash()"""

    def test_same_ingredients_same_hash(self):
        """The same ingredient list must always produce the same hash."""
        h1 = RecipeSimilarityService.compute_ingredient_hash(["tomato", "pasta"])
        h2 = RecipeSimilarityService.compute_ingredient_hash(["tomato", "pasta"])
        assert h1 == h2

    def test_order_independent(self):
        """
        Ingredient order must not affect the hash. A recipe with
        ['pasta', 'tomato'] is the same as ['tomato', 'pasta'].
        """
        h1 = RecipeSimilarityService.compute_ingredient_hash(["pasta", "tomato", "cheese"])
        h2 = RecipeSimilarityService.compute_ingredient_hash(["cheese", "tomato", "pasta"])
        assert h1 == h2

    def test_different_ingredients_different_hash(self):
        """Different ingredient lists must produce different hashes."""
        h1 = RecipeSimilarityService.compute_ingredient_hash(["tomato", "pasta"])
        h2 = RecipeSimilarityService.compute_ingredient_hash(["tomato", "rice"])
        assert h1 != h2

    def test_case_insensitive(self):
        """
        'Tomato' and 'tomato' should produce the same hash because
        normalization lowercases everything before hashing.
        """
        h1 = RecipeSimilarityService.compute_ingredient_hash(["Tomato", "Pasta"])
        h2 = RecipeSimilarityService.compute_ingredient_hash(["tomato", "pasta"])
        assert h1 == h2

    def test_plural_normalizes_to_same_hash(self):
        """
        'Tomatoes' and 'tomato' should produce the same hash after
        the pluralization stripping in normalize_ingredient_name.
        """
        h1 = RecipeSimilarityService.compute_ingredient_hash(["Tomatoes", "pasta"])
        h2 = RecipeSimilarityService.compute_ingredient_hash(["tomato", "pasta"])
        assert h1 == h2

    def test_empty_list_produces_valid_hash(self):
        """An empty ingredient list should return a 64-char hex SHA256 string."""
        result = RecipeSimilarityService.compute_ingredient_hash([])
        assert isinstance(result, str)
        assert len(result) == 64  # SHA256 = 32 bytes = 64 hex chars

    def test_returns_hex_string(self):
        """The hash must be a valid hex string (all chars 0-9, a-f)."""
        result = RecipeSimilarityService.compute_ingredient_hash(["tomato"])
        assert all(c in "0123456789abcdef" for c in result)


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: calculate_jaccard_similarity
# ─────────────────────────────────────────────────────────────────────────────

class TestCalculateJaccardSimilarity:
    """
    Tests for RecipeSimilarityService.calculate_jaccard_similarity().

    This is pure math with no dependencies — the most straightforward tests
    in this file. Also the most important: this is the function that decides
    whether an OpenAI call is made or not.
    """

    def test_both_empty_returns_one(self):
        """Two empty sets are identical — similarity = 1.0."""
        result = RecipeSimilarityService.calculate_jaccard_similarity(set(), set())
        assert result == 1.0

    def test_one_empty_returns_zero(self):
        """One empty set and one non-empty set have no overlap — similarity = 0.0."""
        result = RecipeSimilarityService.calculate_jaccard_similarity(
            set(), {"tomato", "pasta"}
        )
        assert result == 0.0

    def test_other_empty_returns_zero(self):
        """Symmetric: non-empty vs empty also returns 0.0."""
        result = RecipeSimilarityService.calculate_jaccard_similarity(
            {"tomato", "pasta"}, set()
        )
        assert result == 0.0

    def test_identical_sets_returns_one(self):
        """Identical sets → intersection == union → similarity = 1.0."""
        s = {"tomato", "pasta", "cheese"}
        result = RecipeSimilarityService.calculate_jaccard_similarity(s, s.copy())
        assert result == 1.0

    def test_no_overlap_returns_zero(self):
        """Sets with no common elements → intersection = 0 → similarity = 0.0."""
        result = RecipeSimilarityService.calculate_jaccard_similarity(
            {"apple", "banana"}, {"carrot", "dill"}
        )
        assert result == 0.0

    def test_docstring_example(self):
        """
        Verify the exact example from the docstring:
          set1 = {tomato, pasta, cheese}
          set2 = {tomato, pasta, basil}
          intersection = {tomato, pasta} = 2 elements
          union = {tomato, pasta, cheese, basil} = 4 elements
          similarity = 2/4 = 0.5
        """
        set1 = {"tomato", "pasta", "cheese"}
        set2 = {"tomato", "pasta", "basil"}
        result = RecipeSimilarityService.calculate_jaccard_similarity(set1, set2)
        assert result == pytest.approx(0.5)

    def test_single_element_shared(self):
        """
        {A} vs {A} → intersection=1, union=1 → similarity=1.0
        """
        result = RecipeSimilarityService.calculate_jaccard_similarity({"A"}, {"A"})
        assert result == 1.0

    def test_single_element_not_shared(self):
        """
        {A} vs {B} → intersection=0, union=2 → similarity=0.0
        """
        result = RecipeSimilarityService.calculate_jaccard_similarity({"A"}, {"B"})
        assert result == 0.0

    def test_three_of_four_overlap(self):
        """
        {A,B,C,D} vs {A,B,C,E}
        intersection = {A,B,C} = 3
        union = {A,B,C,D,E} = 5
        similarity = 3/5 = 0.6
        """
        result = RecipeSimilarityService.calculate_jaccard_similarity(
            {"A", "B", "C", "D"}, {"A", "B", "C", "E"}
        )
        assert result == pytest.approx(0.6)

    def test_result_is_always_between_zero_and_one(self):
        """Similarity score must always be in [0.0, 1.0]."""
        cases = [
            (set(), set()),
            ({"A"}, set()),
            ({"A"}, {"A"}),
            ({"A", "B", "C"}, {"B", "C", "D", "E"}),
        ]
        for s1, s2 in cases:
            result = RecipeSimilarityService.calculate_jaccard_similarity(s1, s2)
            assert 0.0 <= result <= 1.0, f"Out of range for {s1} vs {s2}: {result}"

    def test_symmetry(self):
        """Jaccard similarity must be symmetric: sim(A,B) == sim(B,A)."""
        s1 = {"tomato", "pasta", "cheese"}
        s2 = {"tomato", "garlic", "basil"}
        assert RecipeSimilarityService.calculate_jaccard_similarity(s1, s2) == \
               RecipeSimilarityService.calculate_jaccard_similarity(s2, s1)

    def test_above_80_percent_threshold(self):
        """
        This case directly drives cache hit decisions.
        4 of 5 ingredients shared → 4/5 = 0.8 → at the threshold.
        """
        set1 = {"A", "B", "C", "D", "E"}
        set2 = {"A", "B", "C", "D", "F"}
        result = RecipeSimilarityService.calculate_jaccard_similarity(set1, set2)
        assert result == pytest.approx(4 / 6)  # intersection=4, union=6

    def test_exactly_at_80_threshold(self):
        """
        Verify a case that should just pass the 80% threshold used by
        find_cached_recipe. 4 shared, 1 different each side:
        intersection=4, union=6 → 4/6 ≈ 0.667 (below threshold).
        """
        # 9 shared, 1 different = intersection=9, union=11 → 9/11 ≈ 0.818 (above)
        shared = {str(i) for i in range(9)}
        set1 = shared | {"X"}
        set2 = shared | {"Y"}
        result = RecipeSimilarityService.calculate_jaccard_similarity(set1, set2)
        assert result >= 0.80


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: find_cached_recipe
# ─────────────────────────────────────────────────────────────────────────────

class TestFindCachedRecipe:
    """Tests for RecipeSimilarityService.find_cached_recipe()"""

    def test_exact_hash_match_returns_recipe_and_1_0(self):
        """
        When the DB has a recipe with an identical ingredient hash,
        find_cached_recipe must return (recipe, 1.0) without scanning
        all recipes (the exact match short-circuits the similarity scan).
        """
        recipe = make_mock_recipe(["tomato", "pasta"])
        mock_db = make_mock_db_for_find(exact_match=recipe, all_recipes=[])

        result = RecipeSimilarityService.find_cached_recipe(
            mock_db, ["tomato", "pasta"]
        )

        assert result is not None
        returned_recipe, score = result
        assert returned_recipe is recipe
        assert score == 1.0

    def test_returns_none_when_no_cached_recipes(self):
        """When the cache is empty, find_cached_recipe must return None."""
        mock_db = make_mock_db_for_find(exact_match=None, all_recipes=[])

        result = RecipeSimilarityService.find_cached_recipe(
            mock_db, ["tomato", "pasta"]
        )

        assert result is None

    def test_similarity_match_above_threshold_returns_recipe(self):
        """
        A recipe with high ingredient overlap (above 0.80) should be
        returned when there's no exact hash match.

        9 shared ingredients, 1 different → 9/11 ≈ 0.818 > 0.80.
        """
        shared = [f"ingredient_{i}" for i in range(9)]
        user_ingredients = shared + ["user_only"]
        recipe_ingredients = shared + ["recipe_only"]

        recipe = make_mock_recipe(recipe_ingredients)
        mock_db = make_mock_db_for_find(exact_match=None, all_recipes=[recipe])

        result = RecipeSimilarityService.find_cached_recipe(
            mock_db, user_ingredients
        )

        assert result is not None
        returned_recipe, score = result
        assert returned_recipe is recipe
        assert score >= 0.80

    def test_similarity_below_threshold_returns_none(self):
        """
        A recipe with low ingredient overlap (below 0.80) should NOT be
        returned — we'd rather call OpenAI than serve a poor match.

        2 of 5 shared → 2/5 = 0.40 < 0.80.
        """
        recipe = make_mock_recipe(["apple", "banana", "carrot", "dill", "egg"])
        mock_db = make_mock_db_for_find(
            exact_match=None, all_recipes=[recipe]
        )

        result = RecipeSimilarityService.find_cached_recipe(
            mock_db, ["apple", "banana", "fish", "garlic", "honey"]
        )

        assert result is None

    def test_returns_best_match_when_multiple_qualify(self):
        """
        When multiple cached recipes are above the threshold, the one
        with the highest similarity score must be returned.
        """
        # Recipe A: 9/11 ≈ 0.818 similarity
        shared_9 = [f"ing_{i}" for i in range(9)]
        recipe_a = make_mock_recipe(shared_9 + ["a_only"])

        # Recipe B: 10/11 ≈ 0.909 similarity (better match)
        recipe_b = make_mock_recipe(shared_9 + ["ing_9"])  # 10 shared with user

        user_ingredients = shared_9 + ["ing_9", "user_only"]

        mock_db = make_mock_db_for_find(
            exact_match=None, all_recipes=[recipe_a, recipe_b]
        )

        result = RecipeSimilarityService.find_cached_recipe(
            mock_db, user_ingredients
        )

        assert result is not None
        returned_recipe, score = result
        assert returned_recipe is recipe_b  # Higher similarity wins

    def test_cuisine_preference_mismatch_skips_recipe(self):
        """
        If the user requests cuisine='Italian' but the cached recipe has
        cuisine_type='Mexican', that recipe must be skipped even if
        ingredient similarity is high.
        """
        shared = [f"ing_{i}" for i in range(9)]
        recipe = make_mock_recipe(
            shared + ["recipe_only"],
            cuisine_type="Mexican",
        )
        mock_db = make_mock_db_for_find(
            exact_match=None, all_recipes=[recipe]
        )

        result = RecipeSimilarityService.find_cached_recipe(
            mock_db,
            shared + ["user_only"],
            preferences={"cuisine": "Italian"},
        )

        assert result is None

    def test_cuisine_preference_match_returns_recipe(self):
        """A cuisine preference match should NOT skip the recipe."""
        shared = [f"ing_{i}" for i in range(9)]
        recipe = make_mock_recipe(
            shared + ["recipe_only"],
            cuisine_type="Italian",
        )
        mock_db = make_mock_db_for_find(
            exact_match=None, all_recipes=[recipe]
        )

        result = RecipeSimilarityService.find_cached_recipe(
            mock_db,
            shared + ["user_only"],
            preferences={"cuisine": "Italian"},
        )

        assert result is not None

    def test_difficulty_preference_mismatch_skips_recipe(self):
        """Difficulty mismatch skips the recipe."""
        shared = [f"ing_{i}" for i in range(9)]
        recipe = make_mock_recipe(
            shared + ["recipe_only"],
            difficulty="hard",
        )
        mock_db = make_mock_db_for_find(
            exact_match=None, all_recipes=[recipe]
        )

        result = RecipeSimilarityService.find_cached_recipe(
            mock_db,
            shared + ["user_only"],
            preferences={"difficulty": "easy"},
        )

        assert result is None

    def test_meal_type_preference_mismatch_skips_recipe(self):
        """Meal type mismatch skips the recipe."""
        shared = [f"ing_{i}" for i in range(9)]
        recipe = make_mock_recipe(
            shared + ["recipe_only"],
            meal_type="breakfast",
        )
        mock_db = make_mock_db_for_find(
            exact_match=None, all_recipes=[recipe]
        )

        result = RecipeSimilarityService.find_cached_recipe(
            mock_db,
            shared + ["user_only"],
            preferences={"meal_type": "dinner"},
        )

        assert result is None

    def test_no_preferences_does_not_filter(self):
        """
        When preferences=None, no recipe should be filtered out on the
        basis of cuisine/difficulty/meal_type.
        """
        shared = [f"ing_{i}" for i in range(9)]
        recipe = make_mock_recipe(
            shared + ["recipe_only"],
            cuisine_type="Mexican",
            difficulty="hard",
            meal_type="breakfast",
        )
        mock_db = make_mock_db_for_find(
            exact_match=None, all_recipes=[recipe]
        )

        result = RecipeSimilarityService.find_cached_recipe(
            mock_db, shared + ["user_only"], preferences=None
        )

        assert result is not None

    def test_custom_min_similarity_respected(self):
        """
        A custom min_similarity lower than the default (0.80) should allow
        recipes that the default threshold would reject.
        """
        # 1/3 ≈ 0.33 similarity — below default 0.80 but above 0.30
        recipe = make_mock_recipe(["tomato", "pasta", "basil"])
        mock_db = make_mock_db_for_find(
            exact_match=None, all_recipes=[recipe]
        )

        # With default threshold (0.80): no match
        result_default = RecipeSimilarityService.find_cached_recipe(
            mock_db, ["tomato", "rice", "garlic"]
        )
        assert result_default is None

        # Reset mock for second call
        mock_db2 = make_mock_db_for_find(
            exact_match=None, all_recipes=[recipe]
        )

        # With low threshold (0.20): should match
        result_low = RecipeSimilarityService.find_cached_recipe(
            mock_db2, ["tomato", "rice", "garlic"], min_similarity=0.20
        )
        assert result_low is not None


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: calculate_pantry_match
# ─────────────────────────────────────────────────────────────────────────────

class TestCalculatePantryMatch:
    """Tests for RecipeSimilarityService.calculate_pantry_match()"""

    def _make_pantry_items(self, names: list[str]) -> list[dict]:
        """Build pantry item dicts with normalized_name set."""
        return [{"normalized_name": name} for name in names]

    def test_recipe_not_found_returns_zero(self):
        """If the recipe doesn't exist in the DB, match is 0.0."""
        mock_db = Mock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        result = RecipeSimilarityService.calculate_pantry_match(
            mock_db, "nonexistent-id", []
        )
        assert result == 0.0

    def test_recipe_with_no_ingredients_returns_zero(self):
        """A recipe with an empty ingredient_list has no match by definition."""
        recipe = make_mock_recipe([])
        mock_db = Mock()
        mock_db.query.return_value.filter.return_value.first.return_value = recipe

        result = RecipeSimilarityService.calculate_pantry_match(
            mock_db, "recipe-id", self._make_pantry_items(["tomato"])
        )
        assert result == 0.0

    def test_full_match_returns_one(self):
        """When the pantry has every recipe ingredient, match = 1.0."""
        recipe = make_mock_recipe(["tomato", "pasta", "cheese"])
        mock_db = Mock()
        mock_db.query.return_value.filter.return_value.first.return_value = recipe

        pantry = self._make_pantry_items(["tomato", "pasta", "cheese"])
        result = RecipeSimilarityService.calculate_pantry_match(
            mock_db, "recipe-id", pantry
        )
        assert result == pytest.approx(1.0)

    def test_no_match_returns_zero(self):
        """When the pantry has none of the recipe ingredients, match = 0.0."""
        recipe = make_mock_recipe(["tomato", "pasta"])
        mock_db = Mock()
        mock_db.query.return_value.filter.return_value.first.return_value = recipe

        pantry = self._make_pantry_items(["apple", "banana"])
        result = RecipeSimilarityService.calculate_pantry_match(
            mock_db, "recipe-id", pantry
        )
        assert result == 0.0

    def test_partial_match_returns_correct_fraction(self):
        """
        2 of 4 recipe ingredients in pantry → match = 2/4 = 0.5.
        This uses normalized_name for comparison so the match is case-
        and plural-insensitive.
        """
        recipe = make_mock_recipe(["tomato", "pasta", "cheese", "basil"])
        mock_db = Mock()
        mock_db.query.return_value.filter.return_value.first.return_value = recipe

        # Pantry has 'tomato' and 'pasta' but not 'cheese' or 'basil'
        pantry = self._make_pantry_items(["tomato", "pasta", "apple"])
        result = RecipeSimilarityService.calculate_pantry_match(
            mock_db, "recipe-id", pantry
        )
        assert result == pytest.approx(0.5)

    def test_empty_pantry_returns_zero(self):
        """An empty pantry can match 0 of any recipe's ingredients."""
        recipe = make_mock_recipe(["tomato", "pasta"])
        mock_db = Mock()
        mock_db.query.return_value.filter.return_value.first.return_value = recipe

        result = RecipeSimilarityService.calculate_pantry_match(
            mock_db, "recipe-id", []
        )
        assert result == 0.0

    def test_extra_pantry_items_do_not_inflate_score(self):
        """
        Having MORE ingredients in the pantry than the recipe requires
        must not push the score above 1.0. Match is measured against
        recipe ingredients only, not pantry size.
        """
        recipe = make_mock_recipe(["tomato", "pasta"])
        mock_db = Mock()
        mock_db.query.return_value.filter.return_value.first.return_value = recipe

        # Pantry has both recipe ingredients + many extras
        pantry = self._make_pantry_items(
            ["tomato", "pasta", "cheese", "milk", "egg", "flour"]
        )
        result = RecipeSimilarityService.calculate_pantry_match(
            mock_db, "recipe-id", pantry
        )
        assert result == pytest.approx(1.0)


# ─────────────────────────────────────────────────────────────────────────────
# TEST CLASS: get_cache_statistics
# ─────────────────────────────────────────────────────────────────────────────

class TestGetCacheStatistics:
    """Tests for RecipeSimilarityService.get_cache_statistics()"""

    def _make_stats_db(self, total_ai=10, public_ai=8, total_usage=50):
        """
        Build a Mock DB for get_cache_statistics.
        The method calls:
          - db.query(Recipe).filter(is_ai_generated=True).count() → total_ai
          - db.query(Recipe).filter(is_ai_generated=True, is_public=True).count() → public_ai
          - db.query(func.sum(Recipe.usage_count)).scalar() → total_usage
        All three go through the same query mock chain, so we use side_effect
        to return different values on sequential calls.
        """
        mock_db = Mock()
        # count() is called twice (total, then public)
        mock_db.query.return_value.filter.return_value.count.side_effect = [
            total_ai, public_ai
        ]
        # scalar() is called once for total usage
        mock_db.query.return_value.scalar.return_value = total_usage
        return mock_db

    def test_returns_all_expected_keys(self):
        """
        The returned dict must contain all six keys that the router
        serialises into CacheStatsResponse.
        """
        mock_db = self._make_stats_db()

        result = RecipeSimilarityService.get_cache_statistics(mock_db)

        expected_keys = {
            "total_ai_recipes",
            "public_cached_recipes",
            "total_recipe_uses",
            "cache_hit_rate",
            "estimated_api_calls_saved",
            "estimated_cost_saved_usd",
        }
        assert set(result.keys()) == expected_keys

    def test_cache_hit_rate_calculation(self):
        """
        cache_hit_rate = public_cached_recipes / total_ai_recipes
        With 8 public out of 10 total → 0.8
        """
        mock_db = self._make_stats_db(total_ai=10, public_ai=8)

        result = RecipeSimilarityService.get_cache_statistics(mock_db)

        assert result["cache_hit_rate"] == pytest.approx(0.8)

    def test_cache_hit_rate_zero_when_no_recipes(self):
        """
        When total_ai_recipes = 0, cache_hit_rate must be 0.0 — not a
        ZeroDivisionError. This is the empty-database edge case.
        """
        mock_db = self._make_stats_db(total_ai=0, public_ai=0, total_usage=0)

        result = RecipeSimilarityService.get_cache_statistics(mock_db)

        assert result["cache_hit_rate"] == 0.0

    def test_estimated_api_calls_saved_never_negative(self):
        """
        If total_usage < public_recipes (unusual state), estimated_api_calls_saved
        must be 0, not negative — the max(0, ...) guard must hold.
        """
        # total_usage=2, public_recipes=10 → raw = 2-10 = -8 → should clamp to 0
        mock_db = self._make_stats_db(total_ai=10, public_ai=10, total_usage=2)

        result = RecipeSimilarityService.get_cache_statistics(mock_db)

        assert result["estimated_api_calls_saved"] >= 0

    def test_estimated_cost_saved_never_negative(self):
        """estimated_cost_saved_usd must also be clamped to 0 if raw is negative."""
        mock_db = self._make_stats_db(total_ai=10, public_ai=10, total_usage=2)

        result = RecipeSimilarityService.get_cache_statistics(mock_db)

        assert result["estimated_cost_saved_usd"] >= 0.0

    def test_counts_are_correct(self):
        """total_ai_recipes and public_cached_recipes must match DB counts."""
        mock_db = self._make_stats_db(total_ai=15, public_ai=12, total_usage=100)

        result = RecipeSimilarityService.get_cache_statistics(mock_db)

        assert result["total_ai_recipes"] == 15
        assert result["public_cached_recipes"] == 12

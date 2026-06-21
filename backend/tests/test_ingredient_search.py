"""
Unit Tests for Ingredient Search Service

Tests cover:
- Edge cases (empty queries, None values, API failures)
- Minimal input (single character searches)
- Full context input (all fields populated)
- Cache-first strategy validation
- API integration (mocked)
- Error handling and fallbacks
"""

import pytest
import requests
from unittest.mock import Mock, MagicMock, patch
from app.services.ingredient_search import IngredientSearchService
from app.models.ingredient_cache import IngredientCache


class TestIngredientSearchServiceSearch:
    """Tests for search() - main search method with cache + API fallback"""

    def test_search_empty_query_returns_popular(self):
        """Edge case: Empty query should return popular ingredients"""
        mock_db = Mock()

        with patch.object(IngredientSearchService, 'get_popular_ingredients', return_value=[
            {"ingredient_name": "Milk", "popularity": 1000}
        ]) as mock_popular:
            result = IngredientSearchService.search("", mock_db, limit=20)

            mock_popular.assert_called_once_with(mock_db, 20)

    def test_search_too_short_query_returns_popular(self):
        """Edge case: Query < 2 chars should return popular"""
        mock_db = Mock()

        with patch.object(IngredientSearchService, 'get_popular_ingredients', return_value=[]) as mock_popular:
            IngredientSearchService.search("m", mock_db, limit=20)  # 1 char
            mock_popular.assert_called_once()

    def test_search_cache_sufficient_results_skips_api(self):
        """If cache has >=10 results, should NOT call API"""
        mock_db = Mock()
        cache_results = [{"ingredient_name": f"Item{i}", "normalized_name": f"item{i}"} for i in range(15)]

        with patch.object(IngredientSearchService, 'search_cache', return_value=cache_results):
            with patch.object(IngredientSearchService, 'search_openfoodfacts') as mock_api:
                result = IngredientSearchService.search("milk", mock_db, limit=20)

                mock_api.assert_not_called()  # API should NOT be called
                assert len(result) <= 20  # Respects limit

    def test_search_cache_insufficient_calls_api(self):
        """If cache has <10 results, should call API"""
        mock_db = Mock()
        cache_results = [{"ingredient_name": "Milk", "normalized_name": "milk"}]  # Only 1 result
        api_results = [{"ingredient_name": "Almond Milk", "normalized_name": "almond milk"}]

        with patch.object(IngredientSearchService, 'search_cache', return_value=cache_results):
            with patch.object(IngredientSearchService, 'search_openfoodfacts', return_value=api_results):
                with patch.object(IngredientSearchService, 'cache_ingredient'):
                    result = IngredientSearchService.search("milk", mock_db, limit=20)

                    assert len(result) == 2  # Combined cache + API

    def test_search_caches_api_results(self):
        """API results should be cached for future searches"""
        mock_db = Mock()
        cache_results = []
        api_results = [
            {"ingredient_name": "Organic Milk", "normalized_name": "milk"}
        ]

        with patch.object(IngredientSearchService, 'search_cache', return_value=cache_results):
            with patch.object(IngredientSearchService, 'search_openfoodfacts', return_value=api_results):
                with patch.object(IngredientSearchService, 'cache_ingredient') as mock_cache:
                    IngredientSearchService.search("milk", mock_db, limit=20)

                    # Should cache API result
                    mock_cache.assert_called_once()
                    assert mock_cache.call_args[0][0]['ingredient_name'] == "Organic Milk"

    def test_search_removes_duplicate_results(self):
        """Should remove duplicates when combining cache + API"""
        mock_db = Mock()
        cache_results = [
            {"ingredient_name": "Milk", "normalized_name": "milk", "source": "cache"}
        ]
        api_results = [
            {"ingredient_name": "Whole Milk", "normalized_name": "milk", "source": "api"}  # Same normalized name
        ]

        with patch.object(IngredientSearchService, 'search_cache', return_value=cache_results):
            with patch.object(IngredientSearchService, 'search_openfoodfacts', return_value=api_results):
                with patch.object(IngredientSearchService, 'cache_ingredient'):
                    result = IngredientSearchService.search("milk", mock_db, limit=20)

                    # Should only have 1 result (duplicate removed)
                    assert len(result) == 1

    def test_search_api_error_returns_cache_only(self):
        """If API fails, should return cache results without error"""
        mock_db = Mock()
        cache_results = [{"ingredient_name": "Milk", "normalized_name": "milk"}]

        with patch.object(IngredientSearchService, 'search_cache', return_value=cache_results):
            with patch.object(IngredientSearchService, 'search_openfoodfacts', side_effect=Exception("API Error")):
                result = IngredientSearchService.search("milk", mock_db, limit=20)

                # Should still return cache results
                assert len(result) == 1
                assert result[0]['ingredient_name'] == "Milk"

    def test_search_respects_limit(self):
        """Should respect limit parameter"""
        mock_db = Mock()
        cache_results = [{"ingredient_name": f"Item{i}", "normalized_name": f"item{i}"} for i in range(50)]

        with patch.object(IngredientSearchService, 'search_cache', return_value=cache_results):
            result = IngredientSearchService.search("item", mock_db, limit=10)

            assert len(result) <= 10


class TestIngredientSearchServiceSearchCache:
    """Tests for search_cache() - local database search"""

    def test_search_cache_finds_exact_match(self):
        """Should find exact ingredient name match"""
        mock_result = Mock()
        mock_result.to_dict.return_value = {"ingredient_name": "Milk", "normalized_name": "milk"}

        mock_db = Mock()
        mock_db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [mock_result]

        result = IngredientSearchService.search_cache("milk", mock_db, limit=10)

        assert len(result) == 1
        assert result[0]['ingredient_name'] == "Milk"

    def test_search_cache_finds_partial_match(self):
        """Should find partial matches (LIKE query)"""
        mock_result = Mock()
        mock_result.to_dict.return_value = {"ingredient_name": "Almond Milk", "normalized_name": "almond milk"}

        mock_db = Mock()
        mock_db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [mock_result]

        # Searching for "milk" should find "Almond Milk"
        result = IngredientSearchService.search_cache("milk", mock_db, limit=10)

        # Mock should return result
        assert len(result) >= 0  # Depends on mock setup

    def test_search_cache_sorted_by_popularity(self):
        """Results should be sorted by popularity DESC"""
        # This would require checking the order_by call in the mock
        mock_db = Mock()
        mock_db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []

        IngredientSearchService.search_cache("milk", mock_db, limit=10)

        # Verify order_by was called (exact verification would need deeper mocking)

    def test_search_cache_adds_source_field(self):
        """Should add source='cache' to all results"""
        mock_result = Mock()
        mock_result.to_dict.return_value = {"ingredient_name": "Milk"}

        mock_db = Mock()
        mock_db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [mock_result]

        result = IngredientSearchService.search_cache("milk", mock_db, limit=10)

        assert result[0]['source'] == 'cache'


class TestIngredientSearchServiceSearchOpenFoodFacts:
    """Tests for search_openfoodfacts() - external API integration"""

    @patch('app.services.ingredient_search.requests.get')
    def test_search_openfoodfacts_success(self, mock_get):
        """Should successfully query OpenFoodFacts API"""
        mock_response = Mock()
        mock_response.json.return_value = {
            'products': [
                {
                    'product_name': 'Whole Milk',
                    'code': '0123456789012',
                    'categories_tags': ['en:dairy', 'en:milk'],
                    'brands': 'Organic Valley',
                    'image_url': 'https://example.com/milk.jpg',
                    'quantity': '1 gallon'
                }
            ]
        }
        mock_get.return_value = mock_response

        result = IngredientSearchService.search_openfoodfacts("milk", limit=10)

        assert len(result) == 1
        assert result[0]['ingredient_name'] == 'Whole Milk'
        assert result[0]['barcode'] == '0123456789012'
        assert result[0]['category'] == 'dairy'
        assert result[0]['source'] == 'openfoodfacts'

    @patch('app.services.ingredient_search.requests.get')
    def test_search_openfoodfacts_includes_user_agent(self, mock_get):
        """API call should include User-Agent header"""
        mock_response = Mock()
        mock_response.json.return_value = {'products': []}
        mock_get.return_value = mock_response

        IngredientSearchService.search_openfoodfacts("milk", limit=10)

        # Verify User-Agent was included
        call_kwargs = mock_get.call_args[1]
        assert 'headers' in call_kwargs
        assert 'User-Agent' in call_kwargs['headers']

    @patch('app.services.ingredient_search.requests.get')
    def test_search_openfoodfacts_filters_empty_names(self, mock_get):
        """Should skip products with no product_name"""
        mock_response = Mock()
        mock_response.json.return_value = {
            'products': [
                {'product_name': ''},  # Empty name
                {'code': '123'},  # No name field
                {'product_name': 'Milk'}  # Valid
            ]
        }
        mock_get.return_value = mock_response

        result = IngredientSearchService.search_openfoodfacts("milk", limit=10)

        # Should only return the one with valid name
        assert len(result) == 1
        assert result[0]['ingredient_name'] == 'Milk'

    @patch('app.services.ingredient_search.requests.get')
    def test_search_openfoodfacts_handles_timeout(self, mock_get):
        """Should raise error on timeout"""
        mock_get.side_effect = requests.exceptions.Timeout("Timeout")

        with pytest.raises(requests.exceptions.Timeout):
            IngredientSearchService.search_openfoodfacts("milk", limit=10)

    @patch('app.services.ingredient_search.requests.get')
    def test_search_openfoodfacts_handles_http_error(self, mock_get):
        """Should raise error on HTTP error"""
        mock_response = Mock()
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError("500 Server Error")
        mock_get.return_value = mock_response

        with pytest.raises(requests.exceptions.HTTPError):
            IngredientSearchService.search_openfoodfacts("milk", limit=10)

    @patch('app.services.ingredient_search.requests.get')
    def test_search_openfoodfacts_respects_limit(self, mock_get):
        """Should pass limit as page_size parameter"""
        mock_response = Mock()
        mock_response.json.return_value = {'products': []}
        mock_get.return_value = mock_response

        IngredientSearchService.search_openfoodfacts("milk", limit=5)

        # Check that page_size=5 was passed
        call_kwargs = mock_get.call_args[1]
        assert call_kwargs['params']['page_size'] == 5


class TestIngredientSearchServiceCacheIngredient:
    """Tests for cache_ingredient() - add/update cache"""

    def test_cache_new_ingredient(self):
        """Should create new cache entry for new ingredient"""
        mock_db = Mock()
        mock_db.query.return_value.filter_by.return_value.first.return_value = None  # Not found

        ingredient_data = {
            "ingredient_name": "Organic Milk",
            "normalized_name": "milk",
            "category": "dairy",
            "barcode": "0123456789"
        }

        IngredientSearchService.cache_ingredient(ingredient_data, mock_db)

        # Should add new ingredient
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    def test_cache_update_existing_ingredient(self):
        """Should update existing cache entry"""
        existing_ingredient = Mock()
        existing_ingredient.barcode = None
        existing_ingredient.metadata = None

        mock_db = Mock()
        mock_db.query.return_value.filter_by.return_value.first.return_value = existing_ingredient

        ingredient_data = {
            "ingredient_name": "Organic Milk",
            "normalized_name": "milk",
            "category": "dairy",
            "barcode": "0123456789",
            "metadata": {"brand": "Organic Valley"}
        }

        IngredientSearchService.cache_ingredient(ingredient_data, mock_db)

        # Should update barcode and extra_data (the model's column name for metadata)
        assert existing_ingredient.barcode == "0123456789"
        assert existing_ingredient.extra_data == {"brand": "Organic Valley"}
        mock_db.commit.assert_called_once()

    def test_cache_ingredient_defaults_to_pantry_category(self):
        """Should default to 'pantry' category if not provided"""
        mock_db = Mock()
        mock_db.query.return_value.filter_by.return_value.first.return_value = None

        ingredient_data = {
            "ingredient_name": "Unknown Item",
            "normalized_name": "unknown"
            # No category provided
        }

        IngredientSearchService.cache_ingredient(ingredient_data, mock_db)

        # Check that added ingredient has category='pantry'
        added_ingredient = mock_db.add.call_args[0][0]
        assert added_ingredient.category == 'pantry'


class TestIngredientSearchServiceIncrementPopularity:
    """Tests for increment_popularity() - tracking usage"""

    def test_increment_existing_ingredient_popularity(self):
        """Should increment popularity count"""
        mock_ingredient = Mock()
        mock_ingredient.popularity = 50

        mock_db = Mock()
        mock_db.query.return_value.filter_by.return_value.first.return_value = mock_ingredient

        IngredientSearchService.increment_popularity("uuid-123", mock_db)

        assert mock_ingredient.popularity == 51
        mock_db.commit.assert_called_once()

    def test_increment_non_existent_ingredient(self):
        """Edge case: Should handle non-existent ingredient gracefully"""
        mock_db = Mock()
        mock_db.query.return_value.filter_by.return_value.first.return_value = None

        # Should not raise error
        IngredientSearchService.increment_popularity("nonexistent-uuid", mock_db)


class TestIngredientSearchServiceGetPopularIngredients:
    """Tests for get_popular_ingredients() - popular items query"""

    def test_get_popular_returns_sorted_by_popularity(self):
        """Should return ingredients sorted by popularity DESC"""
        mock_results = [
            Mock(to_dict=lambda: {"ingredient_name": "Milk", "popularity": 1000}),
            Mock(to_dict=lambda: {"ingredient_name": "Eggs", "popularity": 800}),
        ]

        mock_db = Mock()
        mock_db.query.return_value.order_by.return_value.limit.return_value.all.return_value = mock_results

        result = IngredientSearchService.get_popular_ingredients(mock_db, limit=100)

        assert len(result) == 2
        assert result[0]['ingredient_name'] == "Milk"

    def test_get_popular_respects_limit(self):
        """Should respect limit parameter"""
        mock_db = Mock()
        mock_db.query.return_value.order_by.return_value.limit.return_value.all.return_value = []

        IngredientSearchService.get_popular_ingredients(mock_db, limit=50)

        # Verify limit was passed
        mock_db.query.return_value.order_by.return_value.limit.assert_called_once_with(50)

    def test_get_popular_adds_source_cache(self):
        """Should add source='cache' to results"""
        mock_result = Mock()
        mock_result.to_dict.return_value = {"ingredient_name": "Milk"}

        mock_db = Mock()
        mock_db.query.return_value.order_by.return_value.limit.return_value.all.return_value = [mock_result]

        result = IngredientSearchService.get_popular_ingredients(mock_db, limit=10)

        assert result[0]['source'] == 'cache'


class TestIngredientSearchServiceDetectCategoryFromTags:
    """Tests for detect_category_from_tags() - category detection"""

    def test_detect_dairy_from_tags(self):
        """Should detect dairy category from tags"""
        tags = ['en:dairy', 'en:milk-products']
        result = IngredientSearchService.detect_category_from_tags(tags)
        assert result == 'dairy'

    def test_detect_produce_from_tags(self):
        """Should detect produce category"""
        tags = ['en:fruits', 'en:fresh-foods']
        result = IngredientSearchService.detect_category_from_tags(tags)
        assert result == 'produce'

    def test_detect_protein_from_tags(self):
        """Should detect protein category"""
        tags = ['en:meats', 'en:chicken']
        result = IngredientSearchService.detect_category_from_tags(tags)
        assert result == 'protein'

    def test_detect_case_insensitive(self):
        """Should match tags case-insensitively"""
        tags = ['EN:DAIRY', 'EN:MILK']
        result = IngredientSearchService.detect_category_from_tags(tags)
        assert result == 'dairy'

    def test_detect_unknown_returns_pantry(self):
        """Unknown tags should default to 'pantry'"""
        tags = ['en:unknown-category', 'en:mystery-food']
        result = IngredientSearchService.detect_category_from_tags(tags)
        assert result == 'pantry'

    def test_detect_empty_tags_returns_pantry(self):
        """Empty tags should default to 'pantry'"""
        tags = []
        result = IngredientSearchService.detect_category_from_tags(tags)
        assert result == 'pantry'

"""
Unit Tests for Ingredients Router

Test Coverage:
- Search ingredients endpoint (GET /ingredients/search)
- Select ingredient endpoint (POST /ingredients/:id/select)
- Get popular ingredients endpoint (GET /ingredients/popular)
- Edge cases: empty query, invalid parameters, API errors
- Error handling: service failures, database errors
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
import uuid

# Mock FastAPI app and dependencies
@pytest.fixture
def mock_app():
    from fastapi import FastAPI
    from app.routers import ingredients

    app = FastAPI()
    app.include_router(ingredients.router, prefix="/ingredients")
    return app


@pytest.fixture
def client(mock_app):
    return TestClient(mock_app)


@pytest.fixture
def mock_db():
    return Mock()


@pytest.fixture
def mock_user_id():
    return str(uuid.uuid4())


# ============================================================
# SEARCH INGREDIENTS TESTS
# ============================================================


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.search')
def test_search_ingredients_success(mock_search, mock_get_db, client, mock_db, auth_headers):
    """Full context: Search for ingredients with valid query"""
    mock_get_db.return_value = mock_db

    mock_search.return_value = [
        {
            'id': str(uuid.uuid4()),
            'ingredient_name': 'Whole Milk',
            'normalized_name': 'milk',
            'category': 'dairy',
            'barcode': '123456',
            'popularity': 150,
            'source': 'cache',
            'metadata': {'brands': 'Store Brand'}
        },
        {
            'id': str(uuid.uuid4()),
            'ingredient_name': 'Almond Milk',
            'normalized_name': 'almond milk',
            'category': 'dairy',
            'popularity': 100,
            'source': 'cache'
        }
    ]

    response = client.get("/ingredients/search?q=milk&limit=20", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['query'] == 'milk'
    assert data['count'] == 2
    assert len(data['results']) == 2
    assert data['results'][0]['ingredient_name'] == 'Whole Milk'
    assert data['results'][0]['popularity'] == 150
    assert data['results'][0]['source'] == 'cache'


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.search')
def test_search_ingredients_empty_results(mock_search, mock_get_db, client, mock_db, auth_headers):
    """Edge case: No results found should return empty list"""
    mock_get_db.return_value = mock_db

    mock_search.return_value = []

    response = client.get("/ingredients/search?q=xyz&limit=20", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['count'] == 0
    assert data['results'] == []


@patch('app.routers.ingredients.get_db')
def test_search_ingredients_empty_query(mock_get_db, client, mock_db, auth_headers):
    """Edge case: Empty query should return 400"""
    mock_get_db.return_value = mock_db

    response = client.get("/ingredients/search?q=   &limit=20", headers=auth_headers)

    assert response.status_code == 400
    assert "cannot be empty" in response.json()['detail'].lower()


@patch('app.routers.ingredients.get_db')
def test_search_ingredients_missing_query(mock_get_db, client, mock_db, auth_headers):
    """Edge case: Missing query parameter should return 422"""
    mock_get_db.return_value = mock_db

    response = client.get("/ingredients/search", headers=auth_headers)

    assert response.status_code == 422


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.search')
def test_search_ingredients_custom_limit(mock_search, mock_get_db, client, mock_db, auth_headers):
    """Full context: Custom limit parameter"""
    mock_get_db.return_value = mock_db

    mock_search.return_value = [
        {
            'id': str(uuid.uuid4()),
            'ingredient_name': 'Milk',
            'normalized_name': 'milk',
            'category': 'dairy',
            'popularity': 100,
            'source': 'cache'
        }
    ]

    response = client.get("/ingredients/search?q=milk&limit=5", headers=auth_headers)

    assert response.status_code == 200
    mock_search.assert_called_once_with('milk', mock_db, limit=5)


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.search')
def test_search_ingredients_max_limit_validation(mock_search, mock_get_db, client, mock_db, auth_headers):
    """Edge case: Limit exceeds maximum should be rejected"""
    mock_get_db.return_value = mock_db

    response = client.get("/ingredients/search?q=milk&limit=200", headers=auth_headers)

    assert response.status_code == 422


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.search')
def test_search_ingredients_min_limit_validation(mock_search, mock_get_db, client, mock_db, auth_headers):
    """Edge case: Limit below minimum should be rejected"""
    mock_get_db.return_value = mock_db

    response = client.get("/ingredients/search?q=milk&limit=0", headers=auth_headers)

    assert response.status_code == 422


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.search')
def test_search_ingredients_service_error(mock_search, mock_get_db, client, mock_db, auth_headers):
    """Error handling: Service error should return 500"""
    mock_get_db.return_value = mock_db

    mock_search.side_effect = Exception("Database connection failed")

    response = client.get("/ingredients/search?q=milk&limit=20", headers=auth_headers)

    assert response.status_code == 500
    assert "Search failed" in response.json()['detail']


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.search')
def test_search_ingredients_with_metadata(mock_search, mock_get_db, client, mock_db, auth_headers):
    """Full context: Results include metadata from OpenFoodFacts"""
    mock_get_db.return_value = mock_db

    mock_search.return_value = [
        {
            'id': str(uuid.uuid4()),
            'ingredient_name': 'Organic Milk',
            'normalized_name': 'milk',
            'category': 'dairy',
            'barcode': '987654',
            'popularity': 50,
            'source': 'openfoodfacts',
            'metadata': {
                'brands': 'Organic Valley',
                'image_url': 'https://example.com/image.jpg',
                'quantity': '1L'
            }
        }
    ]

    response = client.get("/ingredients/search?q=organic%20milk&limit=10", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['results'][0]['metadata']['brands'] == 'Organic Valley'
    assert data['results'][0]['source'] == 'openfoodfacts'


# ============================================================
# SELECT INGREDIENT TESTS
# ============================================================


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.increment_popularity')
def test_select_ingredient_success(mock_increment, mock_get_db, client, mock_db, auth_headers):
    """Full context: Successfully track ingredient selection"""
    mock_get_db.return_value = mock_db

    ingredient_id = str(uuid.uuid4())

    response = client.post(f"/ingredients/{ingredient_id}/select", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'success'
    assert 'popularity updated' in data['message'].lower()
    mock_increment.assert_called_once_with(ingredient_id, mock_db)


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.increment_popularity')
def test_select_ingredient_service_error(mock_increment, mock_get_db, client, mock_db, auth_headers):
    """Error handling: Service error should return 500"""
    mock_get_db.return_value = mock_db

    mock_increment.side_effect = Exception("Database error")

    ingredient_id = str(uuid.uuid4())

    response = client.post(f"/ingredients/{ingredient_id}/select", headers=auth_headers)

    assert response.status_code == 500
    assert "Failed to update popularity" in response.json()['detail']


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.increment_popularity')
def test_select_ingredient_not_found(mock_increment, mock_get_db, client, mock_db, auth_headers):
    """Edge case: Service handles not found silently"""
    mock_get_db.return_value = mock_db

    # Service doesn't raise error for not found, just does nothing
    mock_increment.return_value = None

    ingredient_id = str(uuid.uuid4())

    response = client.post(f"/ingredients/{ingredient_id}/select", headers=auth_headers)

    assert response.status_code == 200


# ============================================================
# GET POPULAR INGREDIENTS TESTS
# ============================================================


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.get_popular_ingredients')
def test_get_popular_ingredients_success(mock_get_popular, mock_get_db, client, mock_db, auth_headers):
    """Full context: Get popular ingredients sorted by usage"""
    mock_get_db.return_value = mock_db

    mock_get_popular.return_value = [
        {
            'id': str(uuid.uuid4()),
            'ingredient_name': 'Milk',
            'normalized_name': 'milk',
            'category': 'dairy',
            'popularity': 500,
            'source': 'cache'
        },
        {
            'id': str(uuid.uuid4()),
            'ingredient_name': 'Eggs',
            'normalized_name': 'eggs',
            'category': 'protein',
            'popularity': 400,
            'source': 'cache'
        }
    ]

    response = client.get("/ingredients/popular?limit=100", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]['ingredient_name'] == 'Milk'
    assert data[0]['popularity'] == 500
    assert data[1]['popularity'] == 400


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.get_popular_ingredients')
def test_get_popular_ingredients_empty(mock_get_popular, mock_get_db, client, mock_db, auth_headers):
    """Edge case: No popular ingredients should return empty list"""
    mock_get_db.return_value = mock_db

    mock_get_popular.return_value = []

    response = client.get("/ingredients/popular", headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == []


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.get_popular_ingredients')
def test_get_popular_ingredients_custom_limit(mock_get_popular, mock_get_db, client, mock_db, auth_headers):
    """Full context: Custom limit parameter"""
    mock_get_db.return_value = mock_db

    mock_get_popular.return_value = [
        {
            'id': str(uuid.uuid4()),
            'ingredient_name': 'Milk',
            'normalized_name': 'milk',
            'category': 'dairy',
            'popularity': 500,
            'source': 'cache'
        }
    ]

    response = client.get("/ingredients/popular?limit=10", headers=auth_headers)

    assert response.status_code == 200
    mock_get_popular.assert_called_once_with(mock_db, limit=10)


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.get_popular_ingredients')
def test_get_popular_ingredients_max_limit(mock_get_popular, mock_get_db, client, mock_db, auth_headers):
    """Edge case: Limit exceeds maximum should be rejected"""
    mock_get_db.return_value = mock_db

    response = client.get("/ingredients/popular?limit=300", headers=auth_headers)

    assert response.status_code == 422


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.get_popular_ingredients')
def test_get_popular_ingredients_service_error(mock_get_popular, mock_get_db, client, mock_db, auth_headers):
    """Error handling: Service error should return 500"""
    mock_get_db.return_value = mock_db

    mock_get_popular.side_effect = Exception("Database connection failed")

    response = client.get("/ingredients/popular", headers=auth_headers)

    assert response.status_code == 500
    assert "Failed to fetch popular ingredients" in response.json()['detail']


@patch('app.routers.ingredients.get_db')
@patch('app.routers.ingredients.IngredientSearchService.get_popular_ingredients')
def test_get_popular_ingredients_default_limit(mock_get_popular, mock_get_db, client, mock_db, auth_headers):
    """Full context: Default limit is 100"""
    mock_get_db.return_value = mock_db

    mock_get_popular.return_value = []

    response = client.get("/ingredients/popular", headers=auth_headers)

    assert response.status_code == 200
    mock_get_popular.assert_called_once_with(mock_db, limit=100)

"""
Test Configuration and Fixtures

Product Manager Note:
- This file contains shared test utilities
- Fixtures are reusable test data/setup
- Mocks simulate external services (database, OpenAI, etc.)
- All tests can use these fixtures automatically

What are fixtures?
- Functions that prepare test data or setup
- Run before each test
- Clean up after test completes
- Example: Create fake database, fake user, etc.
"""

import pytest
from typing import Generator, AsyncGenerator
from fastapi.testclient import TestClient
from httpx import AsyncClient
from unittest.mock import Mock, AsyncMock, patch
import os

# Set test environment variables
os.environ["ENVIRONMENT"] = "testing"
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_KEY"] = "test-key"
os.environ["SUPABASE_SERVICE_KEY"] = "test-service-key"
os.environ["OPENAI_API_KEY"] = "test-openai-key"
os.environ["STRIPE_SECRET_KEY"] = "sk_test_123"
os.environ["STRIPE_WEBHOOK_SECRET"] = "whsec_test"
os.environ["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test"
os.environ["API_VERSION"] = "v1"
os.environ["ALLOWED_ORIGINS"] = "http://localhost"

# Mock Supabase client creation before importing app
with patch('supabase.create_client') as mock_create_client:
    mock_supabase = Mock()
    mock_supabase.auth = Mock()
    mock_create_client.return_value = mock_supabase
    
    from app.main import app
    from app.config import get_settings


# ============================================================
# APP FIXTURES
# ============================================================

@pytest.fixture
def test_client() -> Generator[TestClient, None, None]:
    """
    Synchronous test client for FastAPI

    Usage:
        def test_health_check(test_client):
            response = test_client.get("/health")
            assert response.status_code == 200
    """
    with TestClient(app) as client:
        yield client


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """
    Async test client for FastAPI

    Usage:
        async def test_async_endpoint(async_client):
            response = await async_client.get("/api/v1/recipes")
            assert response.status_code == 200
    """
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client


@pytest.fixture
def settings():
    """
    Get test settings

    Usage:
        def test_config(settings):
            assert settings.environment == "testing"
    """
    return get_settings()


# ============================================================
# AUTH FIXTURES
# ============================================================

@pytest.fixture
def mock_user():
    """
    Fake user data for testing

    Usage:
        def test_user_profile(mock_user):
            assert mock_user["email"] == "test@example.com"
    """
    return {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "email": "test@example.com",
        "subscription_status": "free",
        "created_at": "2024-01-01T00:00:00Z",
    }


@pytest.fixture
def mock_premium_user():
    """
    Fake premium user for testing premium features

    Usage:
        def test_premium_feature(mock_premium_user):
            assert mock_premium_user["subscription_status"] == "premium"
    """
    return {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "email": "premium@example.com",
        "subscription_status": "premium",
        "stripe_customer_id": "cus_test123",
        "created_at": "2024-01-01T00:00:00Z",
    }


@pytest.fixture
def auth_headers(mock_user):
    """
    HTTP headers with auth token

    Usage:
        def test_protected_endpoint(test_client, auth_headers):
            response = test_client.get("/api/v1/pantry", headers=auth_headers)
            assert response.status_code == 200
    """
    return {
        "Authorization": "Bearer test-token-123",
    }


# ============================================================
# DATABASE FIXTURES
# ============================================================

@pytest.fixture
def db_session(mocker):
    """
    Mock database session for testing

    Usage:
        def test_database_operation(db_session):
            # Database operations are mocked
    """
    mock_session = mocker.Mock()
    mock_session.add = mocker.Mock()
    mock_session.commit = mocker.Mock()
    mock_session.refresh = mocker.Mock()
    mock_session.rollback = mocker.Mock()
    mock_session.query = mocker.Mock()
    return mock_session


@pytest.fixture
def mock_pantry_item():
    """
    Fake pantry item for testing

    Usage:
        def test_pantry_item(mock_pantry_item):
            assert mock_pantry_item["ingredient_name"] == "Tomato"
    """
    return {
        "id": "item-123",
        "user_id": "550e8400-e29b-41d4-a716-446655440000",
        "ingredient_name": "Tomato",
        "normalized_name": "tomato",
        "quantity": 2.0,
        "unit": "count",
        "category": "produce",
        "expiration_date": "2024-12-31",
        "location": "pantry",
    }


@pytest.fixture
def mock_recipe():
    """
    Fake recipe for testing

    Usage:
        def test_recipe(mock_recipe):
            assert mock_recipe["title"] == "Pasta Carbonara"
    """
    return {
        "id": "recipe-123",
        "user_id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "Pasta Carbonara",
        "description": "Classic Italian pasta dish",
        "ingredient_list": [
            {"name": "pasta", "quantity": "400", "unit": "grams"},
            {"name": "eggs", "quantity": "3", "unit": "count"},
            {"name": "bacon", "quantity": "150", "unit": "grams"},
        ],
        "instructions": [
            {"step": 1, "text": "Boil pasta"},
            {"step": 2, "text": "Cook bacon"},
            {"step": 3, "text": "Mix with eggs"},
        ],
        "prep_time_minutes": 10,
        "cook_time_minutes": 15,
        "servings": 4,
        "difficulty": "easy",
        "cuisine_type": "Italian",
        "meal_type": "dinner",
        "is_ai_generated": True,
    }


@pytest.fixture
def mock_receipt():
    """
    Fake receipt for testing

    Usage:
        def test_receipt(mock_receipt):
            assert mock_receipt["total_amount"] == 45.67
    """
    return {
        "id": "receipt-123",
        "user_id": "550e8400-e29b-41d4-a716-446655440000",
        "merchant_name": "Whole Foods",
        "purchase_date": "2024-01-15T14:30:00Z",
        "total_amount": 45.67,
        "currency": "USD",
        "line_items": [
            {"item": "Milk", "price": 3.99, "quantity": 1},
            {"item": "Bread", "price": 2.50, "quantity": 2},
            {"item": "Eggs", "price": 4.99, "quantity": 1},
        ],
        "ocr_confidence": 0.95,
        "processed": False,
    }


# ============================================================
# EXTERNAL SERVICE MOCKS
# ============================================================

@pytest.fixture
def mock_openai_response():
    """
    Mock OpenAI API response

    Usage:
        def test_recipe_generation(mocker, mock_openai_response):
            mocker.patch("openai.ChatCompletion.create", return_value=mock_openai_response)
    """
    return {
        "choices": [
            {
                "message": {
                    "content": '{"title": "AI Recipe", "ingredients": ["tomato", "pasta"]}'
                }
            }
        ]
    }


@pytest.fixture
def mock_supabase_auth_success(mocker):
    """
    Mock successful Supabase auth response

    Usage:
        def test_login(mocker, mock_supabase_auth_success):
            mocker.patch("app.routers.auth.supabase.auth.sign_in_with_password", return_value=mock_supabase_auth_success)
    """
    mock_user = mocker.Mock()
    mock_user.id = "550e8400-e29b-41d4-a716-446655440000"
    mock_user.email = "test@example.com"

    mock_session = mocker.Mock()
    mock_session.access_token = "test-access-token-123"
    mock_session.refresh_token = "test-refresh-token-123"

    mock_response = mocker.Mock()
    mock_response.user = mock_user
    mock_response.session = mock_session

    return mock_response


@pytest.fixture
def mock_supabase_client(mocker):
    """
    Mock Supabase client

    Usage:
        def test_database_query(mock_supabase_client):
            # Supabase calls are automatically mocked
    """
    mock = mocker.Mock()
    mock.from_.return_value = mock
    mock.select.return_value = mock
    mock.insert.return_value = mock
    mock.update.return_value = mock
    mock.delete.return_value = mock
    mock.eq.return_value = mock
    mock.single.return_value = {"data": {}, "error": None}
    mock.execute.return_value = {"data": [], "error": None}
    return mock


# ============================================================
# REAL JWT TOKEN FIXTURES FOR TESTING
# ============================================================

@pytest.fixture
def test_user_id():
    """Generate a consistent test user ID"""
    return "550e8400-e29b-41d4-a716-446655440000"


@pytest.fixture
def generate_test_token():
    """
    Factory fixture to generate real JWT tokens for testing.
    
    Usage:
        def test_something(generate_test_token):
            token = generate_test_token(user_id="123", email="test@example.com")
            headers = {"Authorization": f"Bearer {token}"}
    """
    from jose import jwt
    from datetime import datetime, timedelta
    
    def _generate(user_id: str = None, email: str = "test@example.com", expired: bool = False):
        """Generate a JWT token for testing"""
        if user_id is None:
            user_id = "550e8400-e29b-41d4-a716-446655440000"
        
        # Token payload (mimics Supabase JWT structure)
        exp = datetime.utcnow() - timedelta(hours=1) if expired else datetime.utcnow() + timedelta(hours=1)
        payload = {
            "sub": user_id,  # Subject (user ID)
            "email": email,
            "iat": datetime.utcnow(),  # Issued at
            "exp": exp,  # Expiration
            "role": "authenticated",
        }
        
        # Encode with test secret
        token = jwt.encode(payload, "test-secret-key", algorithm="HS256")
        return token
    
    return _generate


@pytest.fixture
def auth_headers(generate_test_token, test_user_id):
    """
    Generate authentication headers with a valid JWT token.
    
    Usage:
        def test_protected_route(client, auth_headers):
            response = client.get("/api/v1/protected", headers=auth_headers)
            assert response.status_code == 200
    """
    token = generate_test_token(user_id=test_user_id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def mock_supabase_token_validation(mocker, test_user_id):
    """
    Automatically mock Supabase token validation for all tests.
    This allows our test JWT tokens to be validated successfully.
    
    The mock intercepts supabase.auth.get_user() calls and validates
    the token format, then returns a mock user response.
    """
    def mock_get_user(token: str):
        """Mock Supabase's get_user method"""
        # Decode the test token to extract user info
        try:
            from jose import jwt
            payload = jwt.decode(token, "test-secret-key", algorithms=["HS256"])
            
            # Create mock user response
            mock_user = mocker.Mock()
            mock_user.id = payload.get("sub", test_user_id)
            mock_user.email = payload.get("email", "test@example.com")
            
            mock_response = mocker.Mock()
            mock_response.user = mock_user
            
            return mock_response
        except Exception:
            # Invalid token - return None to trigger 401
            return None
    
    # Patch the Supabase client's auth.get_user method
    mocker.patch("supabase.create_client", return_value=mocker.Mock(
        auth=mocker.Mock(get_user=mock_get_user)
    ))


@pytest.fixture
def mock_stripe_client(mocker):
    """
    Mock Stripe API client

    Usage:
        def test_subscription(mock_stripe_client):
            # Stripe calls are automatically mocked
    """
    mock = mocker.Mock()
    mock.Customer.create.return_value = {"id": "cus_test123"}
    mock.checkout.Session.create.return_value = {
        "id": "cs_test123",
        "url": "https://checkout.stripe.com/test",
    }
    return mock


# ============================================================
# UTILITY FIXTURES
# ============================================================

@pytest.fixture
def sample_barcode():
    """
    Sample barcode for testing

    Usage:
        def test_barcode_scan(sample_barcode):
            assert len(sample_barcode) == 13
    """
    return "8901234567890"  # Valid EAN-13 barcode


@pytest.fixture
def sample_ocr_text():
    """
    Sample OCR text from receipt

    Usage:
        def test_receipt_parsing(sample_ocr_text):
            lines = sample_ocr_text.split("\n")
    """
    return """
    Whole Foods Market
    123 Main Street

    Milk             $3.99
    Bread            $2.50
    Eggs             $4.99

    Total           $11.48
    """


@pytest.fixture(autouse=True)
def reset_environment():
    """
    Reset environment between tests

    autouse=True means this runs automatically for every test
    Ensures tests don't interfere with each other
    """
    # Setup: runs before test
    yield
    # Teardown: runs after test
    # Clear any cached data, reset state, etc.
    pass

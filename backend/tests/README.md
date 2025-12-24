# Smart Pantry Backend Tests

## 🎯 Quick Start

### Run Tests

**Linux/Mac:**
```bash
./run_tests.sh
```

**Windows:**
```bash
run_tests.bat
```

**Manual:**
```bash
pytest
```

---

## 📁 Test Structure

```
tests/
├── __init__.py
├── conftest.py              # Shared fixtures and configuration
├── unit/                    # Fast, isolated tests
│   ├── __init__.py
│   ├── test_config.py      # Config tests (ACTIVE)
│   ├── test_main.py        # Health endpoints (ACTIVE)
│   ├── test_pantry.py      # Pantry endpoints (TEMPLATE)
│   ├── test_recipes.py     # Recipe endpoints (TEMPLATE)
│   └── test_auth.py        # Auth endpoints (TEMPLATE)
└── integration/             # Multi-component tests
    ├── __init__.py
    └── test_recipe_flow.py  # End-to-end workflows (TEMPLATE)
```

### **Status Key**
- **ACTIVE** - Tests are ready to run
- **TEMPLATE** - Example tests for when you build the feature (marked with `@pytest.mark.skip`)

---

## 🧪 Test Types

### Unit Tests (`tests/unit/`)
- **Purpose:** Test individual functions/endpoints
- **Speed:** ⚡ Fast (< 1 second each)
- **Dependencies:** None (mocked)
- **When to use:** Testing specific logic

**Example:**
```python
def test_add_numbers():
    result = add(2, 3)
    assert result == 5
```

### Integration Tests (`tests/integration/`)
- **Purpose:** Test multiple components together
- **Speed:** 🐢 Slower (1-10 seconds each)
- **Dependencies:** May use real database, APIs
- **When to use:** Testing complete workflows

**Example:**
```python
async def test_recipe_generation_flow():
    # Add pantry items
    # Generate recipe
    # Verify recipe saved
    # Check can retrieve later
```

---

## 🏃 Running Tests

### All Tests
```bash
pytest
```

### By Type
```bash
# Unit tests only (fast)
pytest -m unit

# Integration tests only
pytest -m integration

# Exclude slow tests
pytest -m "not slow"
```

### By Feature
```bash
# Auth tests
pytest -m auth

# Pantry tests
pytest -m pantry

# Recipe tests
pytest -m recipes
```

### Specific File or Function
```bash
# Specific file
pytest tests/unit/test_config.py

# Specific test
pytest tests/unit/test_config.py::test_settings_load

# Specific class
pytest tests/unit/test_main.py::TestHealthEndpoints
```

### With Options
```bash
# Verbose output
pytest -v

# Show print statements
pytest -s

# Stop on first failure
pytest -x

# Re-run failed tests
pytest --lf
```

### Coverage Report
```bash
# Generate HTML coverage report
pytest --cov=app --cov-report=html

# Open report
open htmlcov/index.html  # Mac
start htmlcov/index.html # Windows
```

---

## ✍️ Writing Tests

### Basic Test
```python
import pytest
from fastapi import status


@pytest.mark.unit
def test_health_check(test_client):
    """Test health endpoint returns OK"""
    response = test_client.get("/health")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "ok"
```

### Using Fixtures
```python
@pytest.mark.unit
def test_with_auth(test_client, auth_headers, mock_user):
    """Test authenticated endpoint"""
    response = test_client.get(
        "/api/v1/pantry",
        headers=auth_headers
    )

    assert response.status_code == status.HTTP_200_OK
```

### Testing POST Requests
```python
@pytest.mark.unit
def test_create_item(test_client, auth_headers):
    """Test creating pantry item"""
    new_item = {
        "ingredient_name": "Tomato",
        "quantity": 2,
        "unit": "count",
    }

    response = test_client.post(
        "/api/v1/pantry",
        json=new_item,
        headers=auth_headers
    )

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["ingredient_name"] == "Tomato"
```

### Testing Async Endpoints
```python
@pytest.mark.asyncio
async def test_async_endpoint(async_client, auth_headers):
    """Test async endpoint"""
    response = await async_client.get(
        "/api/v1/recipes/suggestions",
        headers=auth_headers
    )

    assert response.status_code == status.HTTP_200_OK
```

### Using Mocks
```python
@pytest.mark.unit
def test_with_mock_api(test_client, mocker):
    """Test endpoint that calls external API"""
    # Mock the external API call
    mock_response = {"product_name": "Tomato"}
    mocker.patch(
        "app.services.openfoodfacts.lookup",
        return_value=mock_response
    )

    response = test_client.get("/api/v1/pantry/barcode/123")

    assert response.status_code == status.HTTP_200_OK
```

---

## 🔧 Available Fixtures

Defined in `conftest.py`, available to all tests:

### App Fixtures
- `test_client` - Synchronous HTTP client
- `async_client` - Async HTTP client
- `settings` - App configuration

### Auth Fixtures
- `mock_user` - Fake free user
- `mock_premium_user` - Fake premium user
- `auth_headers` - HTTP headers with auth token

### Data Fixtures
- `mock_pantry_item` - Fake pantry item
- `mock_recipe` - Fake recipe
- `mock_receipt` - Fake receipt

### External Service Mocks
- `mock_openai_response` - Mocked OpenAI API
- `mock_supabase_client` - Mocked Supabase
- `mock_stripe_client` - Mocked Stripe

### Utilities
- `sample_barcode` - Valid barcode for testing
- `sample_ocr_text` - Sample receipt text

---

## 📊 Test Coverage

### Current Coverage

Run tests with coverage:
```bash
pytest --cov=app --cov-report=term
```

**Target:** 80% coverage minimum

### View Coverage Report

```bash
# Generate HTML report
pytest --cov=app --cov-report=html

# Open in browser
open htmlcov/index.html
```

### Coverage by File
- `app/config.py` - 100% ✅
- `app/main.py` - 100% ✅
- Other files - 0% (not yet implemented)

---

## ✅ Test Checklist

When building a new feature, write tests for:

- [ ] **Happy path** - Feature works as expected
- [ ] **Validation** - Invalid input is rejected
- [ ] **Authentication** - Requires auth if needed
- [ ] **Authorization** - Users can only access their own data
- [ ] **Edge cases** - Empty values, very large values, special characters
- [ ] **Error handling** - External API failures, database errors
- [ ] **Business logic** - Calculations are correct

**Example: Adding Pantry Item**

- [x] Add item successfully
- [x] Reject item without required fields
- [x] Require authentication
- [x] User can only add to their own pantry
- [x] Handle duplicate ingredients
- [x] Validate quantity is positive
- [x] Normalize ingredient names

---

## 🐛 Troubleshooting

### Tests not running
```bash
# Make sure you're in backend/ directory
cd backend

# Activate virtual environment
source venv/bin/activate  # Mac/Linux
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt
```

### Import errors
```bash
# Install package in development mode
pip install -e .
```

### Tests pass locally, fail in CI
- Check environment variables are set in CI
- Ensure database is clean before tests
- Use UTC timezone

### Slow tests
```bash
# Run only fast tests
pytest -m "not slow"

# Parallelize tests
pip install pytest-xdist
pytest -n auto
```

---

## 📚 Resources

- [Full Testing Guide](../TESTING.md) - Comprehensive testing documentation
- [Pytest Docs](https://docs.pytest.org/)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)

---

## 🚀 Next Steps

1. **Run existing tests:**
   ```bash
   pytest -m unit -v
   ```

2. **Check coverage:**
   ```bash
   pytest --cov=app --cov-report=html
   ```

3. **As you build features:**
   - Remove `@pytest.mark.skip` from template tests
   - Update test assertions to match your implementation
   - Add new tests for edge cases

4. **Write tests BEFORE coding (TDD):**
   - Write test that fails
   - Implement feature
   - Test passes ✅

---

Happy testing! 🧪✨

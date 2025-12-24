# Testing Guide for Smart Pantry Backend

## 🎯 Overview

This guide explains how to test your FastAPI backend. Testing ensures your code works correctly and prevents bugs from reaching production.

---

## 📚 Table of Contents

1. [What is Testing?](#what-is-testing)
2. [Setup](#setup)
3. [Running Tests](#running-tests)
4. [Writing Tests](#writing-tests)
5. [Test Coverage](#test-coverage)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## What is Testing?

### **For Product Managers**

**Testing** is writing code that checks if your application code works correctly.

**Analogy:** Like proofreading an email before sending it.

**Example:**
- **Your code:** Function that adds 2 + 2
- **Test code:** Checks if the function returns 4
- **If test fails:** You know there's a bug to fix

### **Types of Tests**

| Type | What It Tests | Speed | When to Use |
|------|---------------|-------|-------------|
| **Unit Tests** | Individual functions | ⚡ Fast | Test specific logic (add item to pantry) |
| **Integration Tests** | Multiple components together | 🐢 Slower | Test workflows (scan receipt → save to budget) |
| **End-to-End Tests** | Complete user flows | 🐌 Slowest | Test critical paths (signup → create recipe) |

---

## Setup

### **1. Install Testing Dependencies**

```bash
cd backend
pip install -r requirements.txt
```

This installs:
- `pytest` - Test framework
- `pytest-asyncio` - Async support
- `pytest-cov` - Coverage reports
- `pytest-mock` - Mocking external services
- `httpx` - HTTP client for API tests
- `faker` - Fake data generator

### **2. Verify Installation**

```bash
pytest --version
```

You should see: `pytest 7.4.4`

---

## Running Tests

### **Run All Tests**

```bash
pytest
```

Output:
```
tests/unit/test_config.py ........                    [ 33%]
tests/unit/test_main.py ......                        [ 66%]
tests/integration/test_recipe_flow.py s               [100%]

======== 14 passed, 1 skipped in 2.31s ========
```

### **Run Specific Test File**

```bash
pytest tests/unit/test_config.py
```

### **Run Specific Test Function**

```bash
pytest tests/unit/test_config.py::TestConfiguration::test_settings_load
```

### **Run Tests by Marker**

```bash
# Run only unit tests (fast)
pytest -m unit

# Run only auth tests
pytest -m auth

# Run only pantry tests
pytest -m pantry

# Exclude slow tests
pytest -m "not slow"
```

### **Run with Verbose Output**

```bash
pytest -v
```

Shows each test name and result.

### **Run with Coverage Report**

```bash
pytest --cov=app --cov-report=html
```

Generates coverage report in `htmlcov/index.html`

### **Run in Watch Mode**

```bash
pytest-watch
```

Automatically reruns tests when files change (requires `pip install pytest-watch`)

---

## Writing Tests

### **Test File Structure**

```
tests/
├── conftest.py              # Shared fixtures
├── unit/                    # Fast, isolated tests
│   ├── test_config.py
│   ├── test_main.py
│   ├── test_pantry.py
│   └── test_recipes.py
└── integration/             # Tests multiple components
    └── test_recipe_flow.py
```

### **Naming Conventions**

✅ **Good Names:**
- `test_add_pantry_item_success`
- `test_login_with_invalid_password`
- `test_recipe_generation_requires_auth`

❌ **Bad Names:**
- `test1`
- `test_stuff`
- `it_works`

**Rule:** Test names should describe what they test and expected outcome.

### **Basic Test Structure**

```python
import pytest
from fastapi import status


@pytest.mark.unit
def test_health_check(test_client):
    """Test that health check endpoint returns OK"""
    # Arrange: Set up test data
    expected_status = "ok"

    # Act: Call the code being tested
    response = test_client.get("/health")

    # Assert: Check the results
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] == expected_status
```

### **Testing API Endpoints**

```python
@pytest.mark.unit
def test_add_pantry_item(test_client, auth_headers):
    """Test adding item to pantry"""
    # Prepare test data
    new_item = {
        "ingredient_name": "Tomato",
        "quantity": 2,
        "unit": "count",
    }

    # Make API call
    response = test_client.post(
        "/api/v1/pantry",
        json=new_item,
        headers=auth_headers
    )

    # Check response
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["ingredient_name"] == "Tomato"
    assert "id" in data
```

### **Testing with Mocks**

**Why mock?**
- Don't want to call real OpenAI API (costs money)
- Don't want to send real emails
- Tests should be fast and isolated

```python
@pytest.mark.unit
def test_generate_recipe(test_client, auth_headers, mocker):
    """Test AI recipe generation (mocked OpenAI)"""
    # Mock OpenAI API call
    mock_response = {
        "choices": [{
            "message": {
                "content": '{"title": "Pasta", "ingredients": ["pasta", "sauce"]}'
            }
        }]
    }
    mocker.patch("openai.ChatCompletion.create", return_value=mock_response)

    # Call endpoint
    response = test_client.post(
        "/api/v1/recipes/generate",
        json={"preferences": {"cuisine": "Italian"}},
        headers=auth_headers
    )

    # Verify
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["title"] == "Pasta"
```

### **Testing Async Functions**

```python
@pytest.mark.asyncio
async def test_async_endpoint(async_client, auth_headers):
    """Test async API endpoint"""
    response = await async_client.get(
        "/api/v1/recipes/suggestions",
        headers=auth_headers
    )

    assert response.status_code == status.HTTP_200_OK
```

### **Using Fixtures**

Fixtures are defined in `tests/conftest.py` and can be used in any test:

```python
def test_with_fixtures(test_client, auth_headers, mock_user):
    """
    test_client: HTTP client to call API
    auth_headers: Authentication headers
    mock_user: Fake user data
    """
    # Use fixtures directly
    response = test_client.get("/api/v1/auth/me", headers=auth_headers)
    assert response.json()["email"] == mock_user["email"]
```

### **Testing Error Cases**

Always test both success AND failure cases:

```python
def test_add_pantry_item_missing_fields(test_client, auth_headers):
    """Test validation error when required fields missing"""
    invalid_item = {
        "quantity": 2,
        # Missing: ingredient_name (required)
    }

    response = test_client.post(
        "/api/v1/pantry",
        json=invalid_item,
        headers=auth_headers
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "ingredient_name" in response.json()["detail"][0]["loc"]
```

---

## Test Coverage

### **What is Coverage?**

**Coverage** measures what % of your code is tested.

**Example:**
```python
def divide(a, b):
    if b == 0:
        return None
    return a / b
```

**50% Coverage:**
```python
def test_divide():
    assert divide(10, 2) == 5  # Tests the happy path only
```

**100% Coverage:**
```python
def test_divide_success():
    assert divide(10, 2) == 5

def test_divide_by_zero():
    assert divide(10, 0) is None  # Tests error case
```

### **Generate Coverage Report**

```bash
pytest --cov=app --cov-report=html
```

Open `htmlcov/index.html` in browser to see:
- Which files are tested
- Which lines are covered
- Which lines are missing tests

### **Coverage Target**

Our target: **80% coverage** (configured in `pytest.ini`)

- Below 80%: Tests fail
- 80-90%: Good
- 90-100%: Excellent

**Note:** 100% coverage doesn't mean no bugs! But it's a good safety net.

---

## Best Practices

### **1. Follow AAA Pattern**

```python
def test_example():
    # Arrange: Set up test data
    user_data = {"email": "test@example.com"}

    # Act: Call the code being tested
    result = create_user(user_data)

    # Assert: Check the result
    assert result["email"] == "test@example.com"
```

### **2. One Assert Per Test (Guideline)**

✅ **Good:**
```python
def test_user_email():
    user = create_user({"email": "test@example.com"})
    assert user["email"] == "test@example.com"

def test_user_has_id():
    user = create_user({"email": "test@example.com"})
    assert "id" in user
```

❌ **Less Ideal:**
```python
def test_user():
    user = create_user({"email": "test@example.com"})
    assert user["email"] == "test@example.com"
    assert "id" in user
    assert user["subscription"] == "free"
    # If first assert fails, you don't know if others would pass
```

### **3. Test Edge Cases**

```python
# Test normal cases
test_add_pantry_item_success()

# Test edge cases
test_add_pantry_item_with_zero_quantity()
test_add_pantry_item_with_negative_quantity()
test_add_pantry_item_with_very_long_name()
test_add_pantry_item_with_special_characters()
test_add_pantry_item_without_auth()
```

### **4. Use Descriptive Test Names**

```python
# ❌ Bad
def test_pantry():
    ...

# ✅ Good
def test_adding_duplicate_ingredient_increases_quantity():
    ...
```

### **5. Keep Tests Independent**

Each test should:
- Not depend on other tests
- Clean up after itself
- Be runnable in any order

```python
# ❌ Bad: Tests depend on each other
def test_create_user():
    global user_id
    user_id = create_user()

def test_delete_user():
    delete_user(user_id)  # Depends on test_create_user running first!

# ✅ Good: Independent tests
def test_create_user():
    user_id = create_user()
    assert user_id is not None

def test_delete_user():
    user_id = create_user()  # Create fresh user
    result = delete_user(user_id)
    assert result is True
```

### **6. Use Fixtures for Shared Setup**

Instead of duplicating setup code, use fixtures:

```python
# ❌ Bad: Repeated setup
def test_recipe_1():
    user = create_user()
    recipe = create_recipe(user)
    # test logic

def test_recipe_2():
    user = create_user()
    recipe = create_recipe(user)
    # test logic

# ✅ Good: Use fixture
@pytest.fixture
def user_with_recipe():
    user = create_user()
    recipe = create_recipe(user)
    return {"user": user, "recipe": recipe}

def test_recipe_1(user_with_recipe):
    # test logic

def test_recipe_2(user_with_recipe):
    # test logic
```

---

## Troubleshooting

### **Tests Not Found**

**Problem:** `pytest` says "collected 0 items"

**Solutions:**
1. Make sure test files start with `test_`:
   ```
   ✅ test_pantry.py
   ❌ pantry_test.py
   ```

2. Make sure test functions start with `test_`:
   ```python
   ✅ def test_add_item():
   ❌ def add_item_test():
   ```

3. Run from `backend/` directory, not `backend/tests/`

### **Import Errors**

**Problem:** `ModuleNotFoundError: No module named 'app'`

**Solutions:**
1. Make sure you're in the `backend/` directory
2. Make sure virtual environment is activated:
   ```bash
   source venv/bin/activate  # Mac/Linux
   venv\Scripts\activate     # Windows
   ```
3. Install the package in development mode:
   ```bash
   pip install -e .
   ```

### **Tests Pass Locally But Fail in CI**

**Common causes:**
1. **Missing environment variables** - Check CI has `.env` configured
2. **Database state** - Ensure tests clean up after themselves
3. **Timezone differences** - Use UTC for tests
4. **File paths** - Use `pathlib` instead of hardcoded paths

### **Slow Tests**

**Solutions:**
1. Run only unit tests: `pytest -m unit`
2. Skip slow tests: `pytest -m "not slow"`
3. Use mocks instead of real API calls
4. Parallelize tests:
   ```bash
   pip install pytest-xdist
   pytest -n auto  # Use all CPU cores
   ```

### **Flaky Tests**

**Flaky test:** Passes sometimes, fails sometimes (without code changes)

**Common causes:**
1. **Time-dependent logic** - Use fixed times in tests
2. **Random data** - Use seeds for random generators
3. **Race conditions** - Ensure async operations complete
4. **External dependencies** - Mock external APIs

---

## Quick Reference

### **Common Commands**

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app

# Run specific markers
pytest -m unit
pytest -m integration
pytest -m "not slow"

# Run specific file
pytest tests/unit/test_config.py

# Run specific test
pytest tests/unit/test_config.py::test_settings_load

# Verbose output
pytest -v

# Show print statements
pytest -s

# Stop on first failure
pytest -x

# Run last failed tests
pytest --lf

# Show slowest tests
pytest --durations=10
```

### **Useful Markers**

```python
@pytest.mark.unit           # Unit test
@pytest.mark.integration    # Integration test
@pytest.mark.slow          # Slow test
@pytest.mark.skip          # Skip this test
@pytest.mark.skipif(condition)  # Skip if condition
@pytest.mark.parametrize   # Run test with multiple inputs
```

### **Common Assertions**

```python
assert value == expected
assert value is not None
assert value in list
assert "substring" in string
assert response.status_code == 200
assert len(list) == 5
assert callable(function)

# Exception testing
with pytest.raises(ValueError):
    function_that_raises_error()
```

---

## Next Steps

1. **Run existing tests:** `pytest -m unit`
2. **Check coverage:** `pytest --cov=app --cov-report=html`
3. **Write tests as you build features:**
   - Write test first (Test-Driven Development)
   - Implement feature
   - Verify test passes
4. **Remove `@pytest.mark.skip` from example tests** as you implement endpoints

---

## Resources

- [Pytest Documentation](https://docs.pytest.org/)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [Testing Best Practices](https://testdriven.io/blog/testing-best-practices/)

---

Good luck testing! 🧪✨

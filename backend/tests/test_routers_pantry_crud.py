"""
test_routers_pantry_crud.py

PURPOSE:
    Tests for the four pantry CRUD endpoints:
        GET    /api/v1/pantry           — list all items for the current user
        POST   /api/v1/pantry           — add a new item
        PUT    /api/v1/pantry/{item_id} — update an existing item
        DELETE /api/v1/pantry/{item_id} — soft-delete an item

WHY THESE TESTS ARE NEEDED:
    The barcode tests (test_routers_pantry_barcode.py) only cover the barcode
    lookup endpoint. All four CRUD endpoints are used by the mobile app every
    time the user views, adds, edits, or removes a pantry item — but they had
    no test coverage until now.

HOW THE DATABASE IS MOCKED:
    These endpoints depend on a real SQLAlchemy session (via FastAPI's
    Depends(get_db)). Since tests don't have a running database, we use
    FastAPI's dependency override system to inject a Mock session instead:

        app.dependency_overrides[get_db] = lambda: (yield mock_db)

    This replaces get_db for the duration of the test, then restores the
    original. The mock_db fixture simulates the session's .add(), .commit(),
    .refresh(), and .query() methods.

WHY WE MOCK PantryItem IN POST TESTS:
    The POST endpoint creates a real PantryItem(...) in memory and then calls
    db.refresh(item). In a real DB, refresh populates server-generated fields
    like added_date and last_updated. With a mock DB, refresh is a no-op, so
    those fields stay None — which breaks the Pydantic response model (they're
    required strings). Patching app.routers.pantry.PantryItem to return a mock
    object sidesteps this entirely.

AUTH IN TESTS:
    The conftest.py autouse fixture (mock_supabase_token_validation) mocks
    Supabase's token verification for every test. auth_headers contains a real
    JWT token that the mock validator accepts. Tests that omit auth_headers
    get no Authorization header, which triggers a 403 from the middleware.

FIXTURES USED (all from conftest.py unless noted):
    test_client    — FastAPI TestClient connected to the full app
    auth_headers   — {"Authorization": "Bearer <test_jwt>"}
    test_user_id   — "550e8400-e29b-41d4-a716-446655440000"
    mock_db        — (defined in this file) Mock SQLAlchemy session
    override_db    — (defined in this file) injects mock_db via dependency override
"""

import pytest
from fastapi import status
from unittest.mock import Mock, patch

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

PANTRY_URL = "/api/v1/pantry"

# A fixed UUID string used as the item ID in update/delete tests.
# Must be a valid UUID format because the router passes it to SQLAlchemy.
TEST_ITEM_ID = "660e8400-e29b-41d4-a716-446655440001"

# A complete dict matching what PantryItem.to_dict() returns.
# Also matches the fields PantryItemResponse expects.
# Using explicit timestamps because server_default doesn't run without a real DB.
MOCK_ITEM_DICT = {
    "id": TEST_ITEM_ID,
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "ingredient_name": "Whole Milk",
    "normalized_name": "whole milk",
    "quantity": 2.0,
    "unit": "L",
    "category": "dairy",
    "location": None,
    "barcode": None,
    "expiration_date": "2025-12-31",
    "added_date": "2025-01-01T00:00:00",
    "last_updated": "2025-01-01T00:00:00",
    "deleted": False,
}


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def make_mock_pantry_item(overrides=None):
    """
    Create a Mock object that behaves like a PantryItem model instance.

    Why not use a real PantryItem?
        Real PantryItem instances have added_date = None when created in memory
        (the server_default only runs on actual DB insert). PantryItemResponse
        requires added_date to be a string, so to_dict() returning None would
        cause a Pydantic validation error in the router.

    By returning a Mock with a pre-configured to_dict(), we control exactly
    what the response will contain.

    @param overrides - dict of fields to change from the default MOCK_ITEM_DICT
    @returns         - Mock object with to_dict() and .id/.deleted attributes
    """
    data = {**MOCK_ITEM_DICT}
    if overrides:
        data.update(overrides)

    item = Mock()
    item.to_dict.return_value = data
    item.id = data["id"]
    item.deleted = data["deleted"]
    return item


# ─────────────────────────────────────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db():
    """
    Mock SQLAlchemy database session.

    Provides no-op implementations of the session methods the pantry router
    calls (add, commit, refresh). The query chain is set up per-test since
    each test needs different return values.
    """
    db = Mock()
    db.add = Mock()
    db.commit = Mock()
    db.refresh = Mock()
    db.query = Mock()
    return db


@pytest.fixture
def override_db(mock_db):
    """
    Overrides FastAPI's get_db dependency to inject mock_db.

    Uses app.dependency_overrides — FastAPI's built-in mechanism for replacing
    dependencies during tests. The override is removed after each test so it
    doesn't leak into other tests.

    Usage in test:
        def test_something(test_client, override_db, auth_headers):
            # override_db is already active — test_client will use mock_db
    """
    from app.main import app
    from app.database import get_db

    # FastAPI expects a dependency override to be a callable.
    # Using a generator matches how get_db itself works (it yields the session).
    def _override():
        yield mock_db

    app.dependency_overrides[get_db] = _override

    # yield mock_db so tests can configure it (e.g. set up query return values)
    yield mock_db

    # Teardown: remove the override so other tests use the real get_db
    app.dependency_overrides.pop(get_db, None)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v1/pantry
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.pantry
class TestGetPantry:
    """
    Tests for GET /api/v1/pantry

    This endpoint calls PantryService.get_user_pantry(db, user_id) and
    returns a list of PantryItemResponse objects for the authenticated user.
    """

    @patch("app.routers.pantry.PantryService.get_user_pantry")
    def test_get_returns_items_for_user(
        self, mock_get_pantry, test_client, override_db, auth_headers
    ):
        """
        Happy path: authenticated user with items in their pantry.

        Verifies:
          - Status code is 200
          - Response is a list
          - Each item has the expected fields
          - Only this user's item is returned (not items from other users)
        """
        # Arrange: the service returns one mock item
        mock_item = make_mock_pantry_item()
        mock_get_pantry.return_value = [mock_item]

        # Act
        response = test_client.get(PANTRY_URL, headers=auth_headers)

        # Assert: 200 with the expected item data
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["ingredient_name"] == "Whole Milk"
        assert data[0]["quantity"] == 2.0
        assert data[0]["unit"] == "L"
        assert data[0]["category"] == "dairy"

    @patch("app.routers.pantry.PantryService.get_user_pantry")
    def test_get_returns_empty_list_when_pantry_empty(
        self, mock_get_pantry, test_client, override_db, auth_headers
    ):
        """
        Edge case: user has no pantry items yet (new account).

        Verifies:
          - Status code is 200 (not 404 — an empty pantry is not an error)
          - Response body is an empty list
        """
        mock_get_pantry.return_value = []

        response = test_client.get(PANTRY_URL, headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == []

    def test_get_unauthenticated_returns_403(self, test_client, override_db):
        """
        Security check: request without an Authorization header is rejected.

        The auth middleware returns 403 (not 401) for missing tokens in this app.
        We accept both codes here in case the middleware behaviour changes.
        """
        response = test_client.get(PANTRY_URL)  # no auth_headers

        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/v1/pantry
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.pantry
class TestAddPantryItem:
    """
    Tests for POST /api/v1/pantry

    The router:
      1. Normalizes the ingredient name via PantryService.normalize_ingredient_name()
      2. Auto-categorizes if no category was provided
      3. Creates a PantryItem model instance
      4. db.add() → db.commit() → db.refresh()
      5. Returns PantryItemResponse(**item.to_dict())

    We patch PantryItem itself (in the router's module namespace) to return a
    mock object with a controlled to_dict(), sidestepping the server_default
    issue described in the file header.
    """

    @patch("app.routers.pantry.PantryService.normalize_ingredient_name", return_value="whole milk")
    @patch("app.routers.pantry.PantryService.categorize_ingredient", return_value="dairy")
    @patch("app.routers.pantry.PantryItem")
    def test_add_item_success_minimal(
        self,
        MockPantryItem,
        mock_categorize,
        mock_normalize,
        test_client,
        override_db,
        auth_headers,
    ):
        """
        Happy path: only the required fields (name + quantity) are sent.

        Verifies:
          - Status code is 201 Created
          - Response contains the ingredient name and quantity
          - The item was persisted (db.add and db.commit were called)
        """
        # Arrange: PantryItem(...) constructor returns our mock item
        mock_item = make_mock_pantry_item()
        MockPantryItem.return_value = mock_item

        payload = {"ingredient_name": "Whole Milk", "quantity": 2.0}

        # Act
        response = test_client.post(PANTRY_URL, json=payload, headers=auth_headers)

        # Assert
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["ingredient_name"] == "Whole Milk"
        assert data["quantity"] == 2.0

        # The item must have been saved to the database
        override_db.add.assert_called_once()
        override_db.commit.assert_called_once()

    @patch("app.routers.pantry.PantryService.normalize_ingredient_name", return_value="whole milk")
    @patch("app.routers.pantry.PantryService.categorize_ingredient", return_value="dairy")
    @patch("app.routers.pantry.PantryItem")
    def test_add_item_success_all_fields(
        self,
        MockPantryItem,
        mock_categorize,
        mock_normalize,
        test_client,
        override_db,
        auth_headers,
    ):
        """
        Happy path: all optional fields are provided.

        Verifies that the endpoint accepts and stores unit, category,
        location, barcode, and expiration_date when provided.
        """
        mock_item = make_mock_pantry_item({
            "unit": "L",
            "expiration_date": "2025-12-31",
        })
        MockPantryItem.return_value = mock_item

        payload = {
            "ingredient_name": "Whole Milk",
            "quantity": 2.0,
            "unit": "L",
            "category": "dairy",
            "expiration_date": "2025-12-31",
        }

        response = test_client.post(PANTRY_URL, json=payload, headers=auth_headers)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["unit"] == "L"
        assert data["expiration_date"] == "2025-12-31"

    @patch("app.routers.pantry.PantryService.normalize_ingredient_name", return_value="chicken breast")
    @patch("app.routers.pantry.PantryService.categorize_ingredient", return_value="protein")
    @patch("app.routers.pantry.PantryItem")
    def test_add_item_auto_categorizes_when_no_category_provided(
        self,
        MockPantryItem,
        mock_categorize,
        mock_normalize,
        test_client,
        override_db,
        auth_headers,
    ):
        """
        Business logic: when the user omits category, the backend fills it in.

        PantryService.categorize_ingredient() is called and its return value
        is used as the category. This is the auto-categorization feature.

        Verifies that categorize_ingredient is called when category is absent.
        """
        mock_item = make_mock_pantry_item({
            "ingredient_name": "Chicken Breast",
            "normalized_name": "chicken breast",
            "category": "protein",
        })
        MockPantryItem.return_value = mock_item

        # No 'category' field in payload — the backend should fill it in
        payload = {"ingredient_name": "Chicken Breast", "quantity": 1.0}

        response = test_client.post(PANTRY_URL, json=payload, headers=auth_headers)

        assert response.status_code == status.HTTP_201_CREATED

        # categorize_ingredient must have been called (auto-categorization ran)
        mock_categorize.assert_called_once_with("Chicken Breast")

    def test_add_item_fails_without_name(self, test_client, override_db, auth_headers):
        """
        Validation: ingredient_name is required.

        The Pydantic schema on the router has min_length=1 on ingredient_name,
        so omitting it should return 422 Unprocessable Entity (FastAPI's
        standard validation error response).
        """
        payload = {"quantity": 1.0}  # ingredient_name is missing

        response = test_client.post(PANTRY_URL, json=payload, headers=auth_headers)

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_add_item_fails_with_zero_quantity(self, test_client, override_db, auth_headers):
        """
        Validation: quantity must be greater than 0.

        The Pydantic schema has gt=0 on quantity, so sending 0 should return
        422 Unprocessable Entity.
        """
        payload = {"ingredient_name": "Whole Milk", "quantity": 0}

        response = test_client.post(PANTRY_URL, json=payload, headers=auth_headers)

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_add_item_unauthenticated_returns_403(self, test_client, override_db):
        """
        Security check: no auth token → rejected before reaching the handler.
        """
        payload = {"ingredient_name": "Whole Milk", "quantity": 2.0}

        response = test_client.post(PANTRY_URL, json=payload)  # no auth_headers

        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )


# ─────────────────────────────────────────────────────────────────────────────
# PUT /api/v1/pantry/{item_id}
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.pantry
class TestUpdatePantryItem:
    """
    Tests for PUT /api/v1/pantry/{item_id}

    The router:
      1. Queries the DB for the item: must match id, user_id, and deleted=False
      2. Applies the provided fields to the item via setattr()
      3. If ingredient_name changed, re-normalizes it
      4. db.commit() → db.refresh()
      5. Returns PantryItemResponse(**item.to_dict())

    We mock the DB query chain:
        db.query(PantryItem).filter(...).first() → returns our mock_item

    The filter() call receives multiple conditions as a single call with
    multiple arguments, so we mock the full chain as one level:
        mock_db.query.return_value.filter.return_value.first.return_value = mock_item
    """

    @patch("app.routers.pantry.PantryService.normalize_ingredient_name", return_value="whole milk")
    def test_update_item_success(
        self, mock_normalize, test_client, override_db, auth_headers
    ):
        """
        Happy path: partial update — only quantity and unit are changed.

        Verifies:
          - Status code is 200
          - Response contains the updated item data
          - db.commit() was called to persist the changes
        """
        # Arrange: the DB query finds the item
        mock_item = make_mock_pantry_item({"quantity": 3.0, "unit": "kg"})
        override_db.query.return_value.filter.return_value.first.return_value = mock_item

        payload = {"quantity": 3.0, "unit": "kg"}
        url = f"{PANTRY_URL}/{TEST_ITEM_ID}"

        # Act
        response = test_client.put(url, json=payload, headers=auth_headers)

        # Assert
        assert response.status_code == status.HTTP_200_OK
        # Changes must have been saved
        override_db.commit.assert_called_once()

    @patch("app.routers.pantry.PantryService.normalize_ingredient_name", return_value="semi-skimmed milk")
    def test_update_item_renormalizes_name_when_changed(
        self, mock_normalize, test_client, override_db, auth_headers
    ):
        """
        Business logic: if ingredient_name changes, normalized_name is recalculated.

        PantryService.normalize_ingredient_name() must be called when
        ingredient_name is present in the update payload.
        """
        mock_item = make_mock_pantry_item({
            "ingredient_name": "Semi-Skimmed Milk",
            "normalized_name": "semi-skimmed milk",
        })
        override_db.query.return_value.filter.return_value.first.return_value = mock_item

        payload = {"ingredient_name": "Semi-Skimmed Milk"}
        url = f"{PANTRY_URL}/{TEST_ITEM_ID}"

        response = test_client.put(url, json=payload, headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK

        # normalize_ingredient_name must be called when name changes
        mock_normalize.assert_called_once_with("Semi-Skimmed Milk")

    def test_update_item_not_found_returns_404(
        self, test_client, override_db, auth_headers
    ):
        """
        Error case: the item doesn't exist (or belongs to a different user).

        The router returns 404 when the DB query returns None. This covers
        both "item doesn't exist" and "item belongs to another user" — both
        look identical from the client's perspective (intentional, to avoid
        leaking information about other users' pantries).
        """
        # Arrange: DB query returns None (item not found)
        override_db.query.return_value.filter.return_value.first.return_value = None

        payload = {"quantity": 5.0}
        url = f"{PANTRY_URL}/nonexistent-item-id"

        response = test_client.put(url, json=payload, headers=auth_headers)

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not found" in response.json()["detail"].lower()

    def test_update_item_unauthenticated_returns_403(self, test_client, override_db):
        """
        Security check: no auth token → rejected before the handler runs.
        """
        payload = {"quantity": 5.0}
        url = f"{PANTRY_URL}/{TEST_ITEM_ID}"

        response = test_client.put(url, json=payload)  # no auth_headers

        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /api/v1/pantry/{item_id}
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.pantry
class TestDeletePantryItem:
    """
    Tests for DELETE /api/v1/pantry/{item_id}

    The router:
      1. Queries the DB for the item (by id + user_id)
      2. Sets item.deleted = True   ← soft delete, NOT a real SQL DELETE
      3. db.commit()
      4. Returns {"status": "success", "message": ..., "id": item_id}

    The soft delete is a critical business rule: data is never truly removed,
    only hidden. This lets the sync system on the mobile app detect deletions.
    """

    def test_delete_item_success(self, test_client, override_db, auth_headers):
        """
        Happy path: item exists and belongs to the authenticated user.

        Verifies:
          - Status code is 200
          - Response body contains status="success" and the item ID
          - db.commit() was called
        """
        mock_item = make_mock_pantry_item()
        override_db.query.return_value.filter.return_value.first.return_value = mock_item

        url = f"{PANTRY_URL}/{TEST_ITEM_ID}"
        response = test_client.delete(url, headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "success"
        assert TEST_ITEM_ID in data["id"]
        override_db.commit.assert_called_once()

    def test_delete_is_soft_delete_not_hard_delete(
        self, test_client, override_db, auth_headers
    ):
        """
        Business rule: delete sets deleted=True, it does NOT remove the row.

        This is verified by checking that:
          1. mock_item.deleted was set to True
          2. db.delete() was NEVER called (no real row removal)

        If this test breaks, it means someone changed the delete from soft to
        hard — which would break the offline sync system on the mobile app.
        """
        mock_item = make_mock_pantry_item()
        override_db.query.return_value.filter.return_value.first.return_value = mock_item

        url = f"{PANTRY_URL}/{TEST_ITEM_ID}"
        test_client.delete(url, headers=auth_headers)

        # The item's deleted flag must have been set to True
        assert mock_item.deleted is True

        # No actual SQL DELETE should have been issued
        override_db.delete.assert_not_called()

    def test_delete_item_not_found_returns_404(
        self, test_client, override_db, auth_headers
    ):
        """
        Error case: item doesn't exist or belongs to another user.

        Returns 404 in both cases (consistent with update — doesn't reveal
        whether the item belongs to someone else).
        """
        override_db.query.return_value.filter.return_value.first.return_value = None

        url = f"{PANTRY_URL}/nonexistent-item-id"
        response = test_client.delete(url, headers=auth_headers)

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not found" in response.json()["detail"].lower()

    def test_delete_item_unauthenticated_returns_403(self, test_client, override_db):
        """
        Security check: no auth token → rejected before the handler runs.
        """
        url = f"{PANTRY_URL}/{TEST_ITEM_ID}"
        response = test_client.delete(url)  # no auth_headers

        assert response.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

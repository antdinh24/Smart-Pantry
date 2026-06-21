"""
Pantry Router

Product Manager Note:
- Manages user's pantry inventory
- Syncs with mobile app
- Supports barcode scanning
- Tracks expiration dates

Endpoints:
- GET /api/v1/pantry - Get all pantry items
- POST /api/v1/pantry - Add new item
- PUT /api/v1/pantry/:id - Update item
- DELETE /api/v1/pantry/:id - Delete item
- POST /api/v1/pantry/sync - Sync items from mobile
- GET /api/v1/pantry/barcode/:code - Barcode lookup
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date
from app.database import get_db
from app.models.pantry import PantryItem
from app.models.user import User
from app.middleware.auth import get_current_user, get_current_user_id
from app.services.pantry import PantryService
from app.services.barcode import BarcodeService
import uuid

router = APIRouter()


# ============================================================
# REQUEST/RESPONSE SCHEMAS
# ============================================================


class PantryItemCreate(BaseModel):
    """Request body for creating a pantry item"""
    ingredient_name: str = Field(..., min_length=1, max_length=200)
    quantity: float = Field(default=1.0, gt=0)
    unit: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = None
    location: Optional[str] = None
    barcode: Optional[str] = None
    expiration_date: Optional[date] = None


class PantryItemUpdate(BaseModel):
    """Request body for updating a pantry item"""
    ingredient_name: Optional[str] = Field(None, min_length=1, max_length=200)
    quantity: Optional[float] = Field(None, gt=0)
    unit: Optional[str] = Field(None, max_length=50)
    category: Optional[str] = None
    location: Optional[str] = None
    barcode: Optional[str] = None
    expiration_date: Optional[date] = None


class PantryItemResponse(BaseModel):
    """Response for pantry item"""
    id: str
    user_id: str
    ingredient_name: str
    normalized_name: Optional[str]
    quantity: float
    unit: Optional[str]
    category: Optional[str]
    location: Optional[str]
    barcode: Optional[str]
    expiration_date: Optional[str]
    added_date: str
    last_updated: str
    deleted: bool


class SyncRequest(BaseModel):
    """Request body for syncing pantry items"""
    items: List[dict]


class SyncResponse(BaseModel):
    """Response for sync operation"""
    status: str
    created: int
    updated: int
    deleted: int
    total_processed: int


class BarcodeResponse(BaseModel):
    """Response for barcode lookup"""
    product_name: Optional[str]
    brands: Optional[str]
    quantity: Optional[str]
    categories: Optional[str]
    image_url: Optional[str]
    suggested_category: Optional[str]
    barcode: str


# ============================================================
# ENDPOINTS
# ============================================================


@router.get("", response_model=List[PantryItemResponse])
async def get_pantry_items(
    include_deleted: bool = False,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Get all pantry items for current user.

    Product Manager Note:
    - Returns user's complete pantry inventory
    - Can optionally include deleted items (for sync)
    - Sorted by most recently added

    Args:
        include_deleted: Whether to include soft-deleted items
        user_id: Current user ID (from auth token)
        db: Database session

    Returns:
        List of pantry items
    """
    items = PantryService.get_user_pantry(db, user_id, include_deleted)

    return [PantryItemResponse(**item.to_dict()) for item in items]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=PantryItemResponse)
async def add_pantry_item(
    request: PantryItemCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Add a new item to pantry.

    Product Manager Note:
    - Creates new pantry item
    - Auto-normalizes ingredient name
    - Auto-categorizes if category not provided

    Args:
        request: Pantry item details
        user_id: Current user ID
        db: Database session

    Returns:
        Created pantry item
    """
    # Normalize ingredient name
    normalized_name = PantryService.normalize_ingredient_name(request.ingredient_name)

    # Auto-categorize if not provided
    category = request.category or PantryService.categorize_ingredient(request.ingredient_name)

    # Create item
    item = PantryItem(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        ingredient_name=request.ingredient_name,
        normalized_name=normalized_name,
        quantity=request.quantity,
        unit=request.unit,
        category=category,
        location=request.location,
        barcode=request.barcode,
        expiration_date=request.expiration_date,
        deleted=False,
    )

    db.add(item)
    db.commit()
    db.refresh(item)

    return PantryItemResponse(**item.to_dict())


@router.put("/{item_id}", response_model=PantryItemResponse)
async def update_pantry_item(
    item_id: str,
    request: PantryItemUpdate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Update a pantry item.

    Product Manager Note:
    - Updates only provided fields
    - Auto-updates normalized_name if ingredient_name changes
    - Returns 404 if item not found or doesn't belong to user

    Args:
        item_id: ID of item to update
        request: Fields to update
        user_id: Current user ID
        db: Database session

    Returns:
        Updated pantry item

    Raises:
        404: Item not found
    """
    # Find item
    item = db.query(PantryItem).filter(
        PantryItem.id == item_id,
        PantryItem.user_id == user_id,
        PantryItem.deleted == False
    ).first()

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pantry item not found"
        )

    # Update fields
    update_data = request.dict(exclude_unset=True)

    for field, value in update_data.items():
        setattr(item, field, value)

    # Update normalized name if ingredient name changed
    if request.ingredient_name:
        item.normalized_name = PantryService.normalize_ingredient_name(request.ingredient_name)

    db.commit()
    db.refresh(item)

    return PantryItemResponse(**item.to_dict())


@router.delete("/{item_id}")
async def delete_pantry_item(
    item_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Delete a pantry item (soft delete).

    Product Manager Note:
    - Performs soft delete (sets deleted=True)
    - Preserves data for sync purposes
    - Can be restored if needed

    Args:
        item_id: ID of item to delete
        user_id: Current user ID
        db: Database session

    Returns:
        Success message

    Raises:
        404: Item not found
    """
    # Find item
    item = db.query(PantryItem).filter(
        PantryItem.id == item_id,
        PantryItem.user_id == user_id
    ).first()

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pantry item not found"
        )

    # Soft delete
    item.deleted = True
    db.commit()

    return {
        "status": "success",
        "message": "Pantry item deleted",
        "id": str(item.id)
    }


@router.post("/sync", response_model=SyncResponse)
async def sync_pantry_items(
    request: SyncRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Sync pantry items from mobile app.

    Product Manager Note:
    - Handles offline-first sync
    - Creates, updates, or deletes items based on mobile data
    - Resolves conflicts (last write wins)
    - Returns summary of changes

    Flow:
    1. Mobile app sends all pending changes
    2. Backend processes each item
    3. Returns summary (created, updated, deleted counts)

    Args:
        request: List of items from mobile
        user_id: Current user ID
        db: Database session

    Returns:
        Sync summary
    """
    result = PantryService.sync_items(db, user_id, request.items)

    return SyncResponse(**result)


@router.get("/barcode/{barcode}", response_model=BarcodeResponse)
async def lookup_barcode(
    barcode: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Look up product information by barcode.

    Product Manager Note:
    - Uses OpenFoodFacts API (free, no key required)
    - Returns product name, category, and details
    - Used when user scans barcode in app
    - Helps auto-fill pantry item details

    Args:
        barcode: Product barcode (EAN-13, UPC-A, etc.)
        user_id: Current user ID (for auth)

    Returns:
        Product information

    Raises:
        404: Barcode not found in database
        500: Lookup service error
    """
    # Lookup barcode
    product_info = BarcodeService.lookup(barcode)

    if not product_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found for this barcode"
        )

    # Check for error
    if 'error' in product_info:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=product_info['error']
        )

    # Suggest category
    suggested_category = BarcodeService.suggest_category(product_info)

    return BarcodeResponse(
        product_name=product_info.get('product_name'),
        brands=product_info.get('brands'),
        quantity=product_info.get('quantity'),
        categories=product_info.get('categories'),
        image_url=product_info.get('image_url'),
        suggested_category=suggested_category,
        barcode=barcode,
    )


@router.get("/expiring-soon")
async def get_expiring_items(
    days: int = 7,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Get items expiring within specified days.

    Product Manager Note:
    - Helps users reduce food waste
    - Used for notifications
    - Default: 7 days

    Args:
        days: Number of days to look ahead (default: 7)
        user_id: Current user ID
        db: Database session

    Returns:
        List of expiring items
    """
    items = PantryService.get_expiring_soon(db, user_id, days)

    return [PantryItemResponse(**item.to_dict()) for item in items]

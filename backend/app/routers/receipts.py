"""
Receipts Router

Product Manager Note:
- Processes receipt OCR text from scanned images
- Extracts merchant, date, line items, and totals
- Allows user confirmation before adding to pantry
- Privacy-compliant: NO image storage
- Updates monthly analytics when confirmed

Endpoints:
- POST /api/v1/receipts/process - Process OCR text
- POST /api/v1/receipts/confirm - Confirm receipt and add to pantry
- GET /api/v1/receipts - Get user's receipt history
- GET /api/v1/receipts/:id - Get specific receipt
- DELETE /api/v1/receipts/:id - Delete receipt
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime
from app.database import get_db
from app.models.receipt import Receipt
from app.models.pantry import PantryItem
from app.middleware.auth import get_current_user_id
from app.services.receipt_parser import ReceiptParser
from app.services.analytics import AnalyticsService
from app.services.pantry import PantryService
import uuid

router = APIRouter()


# ============================================================
# REQUEST/RESPONSE SCHEMAS
# ============================================================


class ProcessReceiptRequest(BaseModel):
    """Request body for processing OCR text"""
    ocr_text: str = Field(..., min_length=1, description="Raw OCR text from receipt image")


class LineItem(BaseModel):
    """Individual line item from receipt"""
    item: str
    price: float
    quantity: int = 1


class ProcessReceiptResponse(BaseModel):
    """Response from processing receipt OCR"""
    receipt_id: str
    merchant_name: Optional[str]
    purchase_date: Optional[str]
    total_amount: float
    currency: str
    line_items: List[Dict]
    confidence: float
    message: str


class ConfirmReceiptRequest(BaseModel):
    """Request body for confirming receipt"""
    receipt_id: str = Field(..., description="Receipt ID from process endpoint")
    merchant_name: Optional[str] = Field(None, description="User-corrected merchant name")
    purchase_date: Optional[str] = Field(None, description="User-corrected date (ISO format)")
    total_amount: Optional[float] = Field(None, description="User-corrected total")
    line_items: Optional[List[Dict]] = Field(None, description="User-corrected line items")
    notes: Optional[str] = Field(None, max_length=500, description="User notes")


class ConfirmReceiptResponse(BaseModel):
    """Response from confirming receipt"""
    status: str
    message: str
    items_added: int
    receipt_id: str


class ReceiptHistoryItem(BaseModel):
    """Receipt history item"""
    id: str
    merchant_name: Optional[str]
    purchase_date: str
    total_amount: float
    currency: str
    line_items: List[Dict]
    processed: bool
    created_at: str


class ReceiptResponse(BaseModel):
    """Detailed receipt response"""
    id: str
    user_id: str
    merchant_name: Optional[str]
    purchase_date: str
    total_amount: float
    currency: str
    line_items: List[Dict]
    ocr_confidence: Optional[float]
    processed: bool
    notes: Optional[str]
    created_at: str


# ============================================================
# ENDPOINTS
# ============================================================


@router.post("/process", status_code=status.HTTP_200_OK, response_model=ProcessReceiptResponse)
async def process_receipt(
    request: ProcessReceiptRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Process OCR text from receipt image.

    Product Manager Note:
    - Parses merchant, date, items, and total from OCR text
    - Uses tiered merchant detection (DB promoted → hardcoded → all DB → fallback)
    - Returns structured data for user verification
    - Creates pending receipt record (not yet added to pantry)
    - NO image is stored (privacy-compliant)

    Flow:
    1. Parse OCR text using ReceiptParser service
    2. Create pending receipt record in database
    3. Return parsed data to mobile for confirmation screen

    Args:
        request: OCR text from receipt scanner
        user_id: Current user ID (from auth token)
        db: Database session

    Returns:
        Parsed receipt data with confidence score

    Raises:
        400: Invalid OCR text or parsing failed
        500: Unexpected error
    """
    try:
        # Parse OCR text
        parsed_data = ReceiptParser.parse_receipt_text(request.ocr_text, db)

        # Create pending receipt record
        receipt = Receipt(
            id=uuid.uuid4(),
            user_id=uuid.UUID(user_id),
            merchant_name=parsed_data.get('merchant_name'),
            purchase_date=parsed_data.get('purchase_date'),
            total_amount=parsed_data.get('total_amount', 0.0),
            currency=parsed_data.get('currency', 'USD'),
            line_items=parsed_data.get('line_items', []),
            ocr_confidence=parsed_data.get('confidence'),
            processed=False,
            notes=None
        )

        db.add(receipt)
        db.commit()
        db.refresh(receipt)

        return ProcessReceiptResponse(
            receipt_id=str(receipt.id),
            merchant_name=parsed_data.get('merchant_name'),
            purchase_date=parsed_data['purchase_date'].isoformat() if parsed_data.get('purchase_date') else None,
            total_amount=parsed_data.get('total_amount', 0.0),
            currency=parsed_data.get('currency', 'USD'),
            line_items=parsed_data.get('line_items', []),
            confidence=parsed_data.get('confidence', 0.0),
            message="Receipt processed successfully. Please verify the data."
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process receipt: {str(e)}"
        )


@router.post("/confirm", status_code=status.HTTP_201_CREATED, response_model=ConfirmReceiptResponse)
async def confirm_receipt(
    request: ConfirmReceiptRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Confirm receipt and add items to pantry.

    Product Manager Note:
    - User confirms/edits receipt data on mobile
    - Adds all line items to pantry
    - Updates monthly analytics (spending + top ingredients)
    - Marks receipt as processed
    - Privacy-focused: only aggregated analytics stored

    Flow:
    1. Fetch pending receipt by ID
    2. Apply user corrections if any
    3. Add each line item to pantry
    4. Update monthly analytics
    5. Mark receipt as processed

    Args:
        request: Receipt ID and optional corrections
        user_id: Current user ID
        db: Database session

    Returns:
        Confirmation status with count of items added

    Raises:
        404: Receipt not found
        403: Receipt belongs to different user
        409: Receipt already processed
        500: Unexpected error
    """
    try:
        # Fetch receipt
        receipt = db.query(Receipt).filter(
            Receipt.id == request.receipt_id,
        ).first()

        if not receipt:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Receipt not found"
            )

        # Verify ownership
        if str(receipt.user_id) != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Receipt belongs to a different user"
            )

        # Check if already processed
        if receipt.processed:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Receipt has already been processed"
            )

        # Apply user corrections
        if request.merchant_name is not None:
            receipt.merchant_name = request.merchant_name
        if request.purchase_date is not None:
            receipt.purchase_date = datetime.fromisoformat(request.purchase_date.replace('Z', '+00:00'))
        if request.total_amount is not None:
            receipt.total_amount = request.total_amount
        if request.line_items is not None:
            receipt.line_items = request.line_items
        if request.notes is not None:
            receipt.notes = request.notes

        # Add items to pantry
        items_added = 0
        line_items = receipt.line_items or []

        for line_item in line_items:
            item_name = line_item.get('item', '').strip()
            if not item_name:
                continue

            # Normalize and categorize
            normalized_name = PantryService.normalize_ingredient_name(item_name)
            category = PantryService.categorize_ingredient(item_name)

            # Create pantry item
            pantry_item = PantryItem(
                id=uuid.uuid4(),
                user_id=uuid.UUID(user_id),
                ingredient_name=item_name,
                normalized_name=normalized_name,
                quantity=float(line_item.get('quantity', 1)),
                unit='package',
                category=category,
                location=None,
                barcode=None,
                expiration_date=None,
                deleted=False
            )

            db.add(pantry_item)
            items_added += 1

        # Update monthly analytics
        receipt_data = {
            'purchase_date': receipt.purchase_date,
            'total_amount': float(receipt.total_amount),
            'currency': receipt.currency,
            'line_items': receipt.line_items
        }
        AnalyticsService.update_monthly_analytics(db, user_id, receipt_data)

        # Mark as processed
        receipt.processed = True

        db.commit()

        return ConfirmReceiptResponse(
            status="success",
            message=f"Receipt confirmed. {items_added} items added to pantry.",
            items_added=items_added,
            receipt_id=str(receipt.id)
        )

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to confirm receipt: {str(e)}"
        )


@router.get("", response_model=List[ReceiptHistoryItem])
async def get_receipts(
    limit: int = 50,
    include_processed: bool = True,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Get user's receipt history.

    Product Manager Note:
    - Returns all receipts for user
    - Sorted by most recent first
    - Can filter by processed status
    - Useful for viewing spending history

    Args:
        limit: Maximum receipts to return (default: 50)
        include_processed: Whether to include processed receipts (default: True)
        user_id: Current user ID
        db: Database session

    Returns:
        List of receipts
    """
    query = db.query(Receipt).filter(Receipt.user_id == user_id)

    if not include_processed:
        query = query.filter(Receipt.processed == False)

    receipts = query.order_by(Receipt.created_at.desc()).limit(limit).all()

    return [
        ReceiptHistoryItem(
            id=str(receipt.id),
            merchant_name=receipt.merchant_name,
            purchase_date=receipt.purchase_date.isoformat() if receipt.purchase_date else '',
            total_amount=float(receipt.total_amount),
            currency=receipt.currency,
            line_items=receipt.line_items or [],
            processed=receipt.processed,
            created_at=receipt.created_at.isoformat()
        )
        for receipt in receipts
    ]


@router.get("/{receipt_id}", response_model=ReceiptResponse)
async def get_receipt(
    receipt_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Get specific receipt by ID.

    Product Manager Note:
    - Returns full receipt details
    - Used for viewing past receipts
    - Includes OCR confidence score

    Args:
        receipt_id: Receipt UUID
        user_id: Current user ID
        db: Database session

    Returns:
        Receipt details

    Raises:
        404: Receipt not found
        403: Receipt belongs to different user
    """
    receipt = db.query(Receipt).filter(
        Receipt.id == receipt_id,
    ).first()

    if not receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Receipt not found"
        )

    # Verify ownership
    if str(receipt.user_id) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Receipt belongs to a different user"
        )

    return ReceiptResponse(
        id=str(receipt.id),
        user_id=str(receipt.user_id),
        merchant_name=receipt.merchant_name,
        purchase_date=receipt.purchase_date.isoformat() if receipt.purchase_date else '',
        total_amount=float(receipt.total_amount),
        currency=receipt.currency,
        line_items=receipt.line_items or [],
        ocr_confidence=float(receipt.ocr_confidence) if receipt.ocr_confidence else None,
        processed=receipt.processed,
        notes=receipt.notes,
        created_at=receipt.created_at.isoformat()
    )


@router.delete("/{receipt_id}")
async def delete_receipt(
    receipt_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Delete a receipt.

    Product Manager Note:
    - Performs hard delete (permanently removes)
    - Does NOT remove pantry items already added
    - Does NOT reverse analytics updates
    - Used to clean up erroneous scans

    Args:
        receipt_id: Receipt UUID
        user_id: Current user ID
        db: Database session

    Returns:
        Success message

    Raises:
        404: Receipt not found
        403: Receipt belongs to different user
    """
    receipt = db.query(Receipt).filter(
        Receipt.id == receipt_id,
    ).first()

    if not receipt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Receipt not found"
        )

    # Verify ownership
    if str(receipt.user_id) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Receipt belongs to a different user"
        )

    db.delete(receipt)
    db.commit()

    return {
        "status": "success",
        "message": "Receipt deleted",
        "id": str(receipt.id)
    }

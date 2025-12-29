"""
Analytics Router

Product Manager Note:
- Provides monthly grocery spending insights
- Tracks top purchased ingredients
- Privacy-focused: aggregated data only
- NO raw receipt data or images

Endpoints:
- GET /api/v1/analytics/monthly/:month - Get monthly summary
- GET /api/v1/analytics/year/:year - Get yearly summary
"""

from fastapi import APIRouter, Depends, HTTPException, status, Path
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from app.database import get_db
from app.middleware.auth import get_current_user_id
from app.services.analytics import AnalyticsService
import re

router = APIRouter()


# ============================================================
# REQUEST/RESPONSE SCHEMAS
# ============================================================


class TopIngredient(BaseModel):
    """Top ingredient entry"""
    name: str
    count: int
    total_spent: float


class MonthlySummary(BaseModel):
    """Monthly analytics summary"""
    month: str
    total_spending: float
    currency: str
    top_ingredients: List[Dict]


class YearlySummary(BaseModel):
    """Yearly analytics summary"""
    year: int
    months: List[MonthlySummary]
    total_spending: float
    months_with_data: int


# ============================================================
# ENDPOINTS
# ============================================================


@router.get("/monthly/{month}", response_model=MonthlySummary)
async def get_monthly_summary(
    month: str = Path(..., description="Month in YYYY-MM format (e.g., '2025-01')"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Get monthly grocery spending summary.

    Product Manager Note:
    - Returns total spending for the month
    - Includes top 10 most purchased ingredients
    - Privacy-compliant: only aggregated data
    - Used for budget insights and spending reports

    Data Updated:
    - Real-time: when user confirms receipts
    - Automatically aggregates all receipts for the month

    Use Cases:
    - Monthly spending reports
    - Budget tracking dashboards
    - Spending trends visualization
    - Ingredient purchase patterns

    Args:
        month: Month identifier (YYYY-MM format, e.g., "2025-01")
        user_id: Current user ID (from auth token)
        db: Database session

    Returns:
        Monthly summary with spending total and top ingredients

    Raises:
        400: Invalid month format
        500: Service error

    Example:
        GET /api/v1/analytics/monthly/2025-01

        Response:
        {
            "month": "2025-01",
            "total_spending": 542.73,
            "currency": "USD",
            "top_ingredients": [
                {
                    "name": "Milk",
                    "count": 5,
                    "total_spent": 19.95
                },
                {
                    "name": "Eggs",
                    "count": 4,
                    "total_spent": 17.96
                },
                ...
            ]
        }

    Note:
        - Returns zero spending if no receipts for that month
        - top_ingredients sorted by count DESC (most purchased first)
        - Maximum 10 ingredients (space-efficient)
    """
    try:
        # Validate month format (YYYY-MM)
        if not re.match(r'^\d{4}-\d{2}$', month):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid month format. Expected YYYY-MM (e.g., '2025-01')"
            )

        # Get monthly summary
        summary = AnalyticsService.get_monthly_summary(db, user_id, month)

        return MonthlySummary(
            month=summary['month'],
            total_spending=summary['total_spending'],
            currency=summary['currency'],
            top_ingredients=summary['top_ingredients']
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch monthly summary: {str(e)}"
        )


@router.get("/year/{year}", response_model=YearlySummary)
async def get_yearly_summary(
    year: int = Path(..., ge=2020, le=2100, description="Year (e.g., 2025)"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Get yearly grocery spending summary.

    Product Manager Note:
    - Returns all months with data for the year
    - Useful for year-end reports and trends
    - Aggregates total spending across all months
    - Shows spending patterns over time

    Use Cases:
    - Year-end spending reports
    - Annual budget analysis
    - Spending trend charts
    - Comparing months within a year

    Args:
        year: Year (e.g., 2025)
        user_id: Current user ID
        db: Database session

    Returns:
        Yearly summary with monthly breakdowns

    Raises:
        400: Invalid year
        500: Service error

    Example:
        GET /api/v1/analytics/year/2025

        Response:
        {
            "year": 2025,
            "months": [
                {
                    "month": "2025-01",
                    "total_spending": 542.73,
                    "currency": "USD",
                    "top_ingredients": [...]
                },
                {
                    "month": "2025-02",
                    "total_spending": 489.21,
                    "currency": "USD",
                    "top_ingredients": [...]
                },
                ...
            ],
            "total_spending": 1031.94,
            "months_with_data": 2
        }

    Note:
        - Only returns months with at least one receipt
        - Months ordered chronologically (January → December)
        - total_spending is sum of all months
        - Empty year returns zero spending and empty months array
    """
    try:
        # Validate year range
        if year < 2020 or year > 2100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Year must be between 2020 and 2100"
            )

        # Get yearly summary
        monthly_summaries = AnalyticsService.get_year_summary(db, user_id, year)

        # Calculate totals
        total_spending = sum(
            month['total_spending']
            for month in monthly_summaries
        )

        return YearlySummary(
            year=year,
            months=[
                MonthlySummary(
                    month=summary['month'],
                    total_spending=summary['total_spending'],
                    currency=summary['currency'],
                    top_ingredients=summary['top_ingredients']
                )
                for summary in monthly_summaries
            ],
            total_spending=total_spending,
            months_with_data=len(monthly_summaries)
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch yearly summary: {str(e)}"
        )

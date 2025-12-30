"""
Unit Tests for Analytics Router

Test Coverage:
- Get monthly summary endpoint (GET /analytics/monthly/:month)
- Get yearly summary endpoint (GET /analytics/year/:year)
- Edge cases: invalid formats, missing data, out of range
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
    from app.routers import analytics

    app = FastAPI()
    app.include_router(analytics.router, prefix="/analytics")
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
# GET MONTHLY SUMMARY TESTS
# ============================================================


@patch('app.routers.analytics.get_db')
@patch('app.routers.analytics.AnalyticsService.get_monthly_summary')
def test_get_monthly_summary_success(mock_service, mock_get_db, client, mock_db, auth_headers):
    """Full context: Get monthly summary with spending and ingredients"""
    mock_get_db.return_value = mock_db

    mock_service.return_value = {
        'month': '2025-01',
        'total_spending': 542.73,
        'currency': 'USD',
        'top_ingredients': [
            {'name': 'Milk', 'count': 5, 'total_spent': 19.95},
            {'name': 'Eggs', 'count': 4, 'total_spent': 17.96},
            {'name': 'Bread', 'count': 3, 'total_spent': 11.97}
        ]
    }

    response = client.get("/analytics/monthly/2025-01", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['month'] == '2025-01'
    assert data['total_spending'] == 542.73
    assert data['currency'] == 'USD'
    assert len(data['top_ingredients']) == 3
    assert data['top_ingredients'][0]['name'] == 'Milk'
    assert data['top_ingredients'][0]['count'] == 5


@patch('app.routers.analytics.get_db')
@patch('app.routers.analytics.AnalyticsService.get_monthly_summary')
def test_get_monthly_summary_no_data(mock_service, mock_get_db, client, mock_db, auth_headers):
    """Edge case: No spending for month returns zero"""
    mock_get_db.return_value = mock_db

    mock_service.return_value = {
        'month': '2025-01',
        'total_spending': 0.0,
        'currency': 'USD',
        'top_ingredients': []
    }

    response = client.get("/analytics/monthly/2025-01", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['total_spending'] == 0.0
    assert data['top_ingredients'] == []


@patch('app.routers.analytics.get_db')
def test_get_monthly_summary_invalid_format(mock_get_db, client, mock_db, auth_headers):
    """Edge case: Invalid month format should return 400"""
    mock_get_db.return_value = mock_db

    response = client.get("/analytics/monthly/2025-1", headers=auth_headers)

    assert response.status_code == 400
    assert "Invalid month format" in response.json()['detail']


@patch('app.routers.analytics.get_db')
def test_get_monthly_summary_invalid_format_text(mock_get_db, client, mock_db, auth_headers):
    """Edge case: Non-numeric month should return 400"""
    mock_get_db.return_value = mock_db

    response = client.get("/analytics/monthly/january-2025", headers=auth_headers)

    assert response.status_code == 400
    assert "Invalid month format" in response.json()['detail']


@patch('app.routers.analytics.get_db')
def test_get_monthly_summary_invalid_month_13(mock_get_db, client, mock_db, auth_headers):
    """Edge case: Month 13 is technically valid format but logically invalid"""
    mock_get_db.return_value = mock_db

    # Note: 2025-13 passes regex but is invalid date
    # Service should handle this gracefully
    with patch('app.routers.analytics.AnalyticsService.get_monthly_summary') as mock_service:
        mock_service.return_value = {
            'month': '2025-13',
            'total_spending': 0.0,
            'currency': 'USD',
            'top_ingredients': []
        }

        response = client.get("/analytics/monthly/2025-13", headers=auth_headers)

        assert response.status_code == 200


@patch('app.routers.analytics.get_db')
@patch('app.routers.analytics.AnalyticsService.get_monthly_summary')
def test_get_monthly_summary_service_error(mock_service, mock_get_db, client, mock_db, auth_headers):
    """Error handling: Service error should return 500"""
    mock_get_db.return_value = mock_db

    mock_service.side_effect = Exception("Database connection failed")

    response = client.get("/analytics/monthly/2025-01", headers=auth_headers)

    assert response.status_code == 500
    assert "Failed to fetch monthly summary" in response.json()['detail']


@patch('app.routers.analytics.get_db')
@patch('app.routers.analytics.AnalyticsService.get_monthly_summary')
def test_get_monthly_summary_current_month(mock_service, mock_get_db, client, mock_db, auth_headers):
    """Full context: Get current month's spending"""
    mock_get_db.return_value = mock_db

    mock_service.return_value = {
        'month': '2025-12',
        'total_spending': 123.45,
        'currency': 'USD',
        'top_ingredients': [
            {'name': 'Chicken', 'count': 2, 'total_spent': 25.00}
        ]
    }

    response = client.get("/analytics/monthly/2025-12", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['month'] == '2025-12'


@patch('app.routers.analytics.get_db')
@patch('app.routers.analytics.AnalyticsService.get_monthly_summary')
def test_get_monthly_summary_past_year(mock_service, mock_get_db, client, mock_db, auth_headers):
    """Full context: Get data from previous year"""
    mock_get_db.return_value = mock_db

    mock_service.return_value = {
        'month': '2024-01',
        'total_spending': 678.90,
        'currency': 'USD',
        'top_ingredients': []
    }

    response = client.get("/analytics/monthly/2024-01", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['month'] == '2024-01'


# ============================================================
# GET YEARLY SUMMARY TESTS
# ============================================================


@patch('app.routers.analytics.get_db')
@patch('app.routers.analytics.AnalyticsService.get_year_summary')
def test_get_yearly_summary_success(mock_service, mock_get_db, client, mock_db, auth_headers):
    """Full context: Get yearly summary with multiple months"""
    mock_get_db.return_value = mock_db

    mock_service.return_value = [
        {
            'month': '2025-01',
            'total_spending': 542.73,
            'currency': 'USD',
            'top_ingredients': [
                {'name': 'Milk', 'count': 5, 'total_spent': 19.95}
            ]
        },
        {
            'month': '2025-02',
            'total_spending': 489.21,
            'currency': 'USD',
            'top_ingredients': [
                {'name': 'Eggs', 'count': 4, 'total_spent': 17.96}
            ]
        },
        {
            'month': '2025-03',
            'total_spending': 601.50,
            'currency': 'USD',
            'top_ingredients': []
        }
    ]

    response = client.get("/analytics/year/2025", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['year'] == 2025
    assert data['months_with_data'] == 3
    assert data['total_spending'] == 1633.44  # Sum of all months
    assert len(data['months']) == 3
    assert data['months'][0]['month'] == '2025-01'
    assert data['months'][1]['month'] == '2025-02'


@patch('app.routers.analytics.get_db')
@patch('app.routers.analytics.AnalyticsService.get_year_summary')
def test_get_yearly_summary_no_data(mock_service, mock_get_db, client, mock_db, auth_headers):
    """Edge case: No spending for year returns empty"""
    mock_get_db.return_value = mock_db

    mock_service.return_value = []

    response = client.get("/analytics/year/2025", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['year'] == 2025
    assert data['total_spending'] == 0.0
    assert data['months_with_data'] == 0
    assert data['months'] == []


@patch('app.routers.analytics.get_db')
@patch('app.routers.analytics.AnalyticsService.get_year_summary')
def test_get_yearly_summary_single_month(mock_service, mock_get_db, client, mock_db, auth_headers):
    """Edge case: Year with only one month of data"""
    mock_get_db.return_value = mock_db

    mock_service.return_value = [
        {
            'month': '2025-01',
            'total_spending': 100.00,
            'currency': 'USD',
            'top_ingredients': []
        }
    ]

    response = client.get("/analytics/year/2025", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['months_with_data'] == 1
    assert data['total_spending'] == 100.00


@patch('app.routers.analytics.get_db')
def test_get_yearly_summary_year_too_low(mock_get_db, client, mock_db, auth_headers):
    """Edge case: Year below minimum should return 400"""
    mock_get_db.return_value = mock_db

    response = client.get("/analytics/year/2019", headers=auth_headers)

    assert response.status_code == 400
    assert "between 2020 and 2100" in response.json()['detail']


@patch('app.routers.analytics.get_db')
def test_get_yearly_summary_year_too_high(mock_get_db, client, mock_db, auth_headers):
    """Edge case: Year above maximum should return 400"""
    mock_get_db.return_value = mock_db

    response = client.get("/analytics/year/2101", headers=auth_headers)

    assert response.status_code == 400
    assert "between 2020 and 2100" in response.json()['detail']


@patch('app.routers.analytics.get_db')
@patch('app.routers.analytics.AnalyticsService.get_year_summary')
def test_get_yearly_summary_minimum_year(mock_service, mock_get_db, client, mock_db, auth_headers):
    """Edge case: Minimum allowed year (2020)"""
    mock_get_db.return_value = mock_db

    mock_service.return_value = []

    response = client.get("/analytics/year/2020", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['year'] == 2020


@patch('app.routers.analytics.get_db')
@patch('app.routers.analytics.AnalyticsService.get_year_summary')
def test_get_yearly_summary_maximum_year(mock_service, mock_get_db, client, mock_db, auth_headers):
    """Edge case: Maximum allowed year (2100)"""
    mock_get_db.return_value = mock_db

    mock_service.return_value = []

    response = client.get("/analytics/year/2100", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['year'] == 2100


@patch('app.routers.analytics.get_db')
@patch('app.routers.analytics.AnalyticsService.get_year_summary')
def test_get_yearly_summary_service_error(mock_service, mock_get_db, client, mock_db, auth_headers):
    """Error handling: Service error should return 500"""
    mock_get_db.return_value = mock_db

    mock_service.side_effect = Exception("Database connection failed")

    response = client.get("/analytics/year/2025", headers=auth_headers)

    assert response.status_code == 500
    assert "Failed to fetch yearly summary" in response.json()['detail']


@patch('app.routers.analytics.get_db')
@patch('app.routers.analytics.AnalyticsService.get_year_summary')
def test_get_yearly_summary_all_months(mock_service, mock_get_db, client, mock_db, auth_headers):
    """Full context: Year with all 12 months of data"""
    mock_get_db.return_value = mock_db

    mock_service.return_value = [
        {
            'month': f'2025-{str(i).zfill(2)}',
            'total_spending': 100.0 * i,
            'currency': 'USD',
            'top_ingredients': []
        }
        for i in range(1, 13)
    ]

    response = client.get("/analytics/year/2025", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['months_with_data'] == 12
    assert data['total_spending'] == sum(100.0 * i for i in range(1, 13))
    assert len(data['months']) == 12


@patch('app.routers.analytics.get_db')
@patch('app.routers.analytics.AnalyticsService.get_year_summary')
def test_get_yearly_summary_zero_spending_months(mock_service, mock_get_db, client, mock_db, auth_headers):
    """Edge case: Months with zero spending"""
    mock_get_db.return_value = mock_db

    mock_service.return_value = [
        {
            'month': '2025-01',
            'total_spending': 0.0,
            'currency': 'USD',
            'top_ingredients': []
        },
        {
            'month': '2025-02',
            'total_spending': 0.0,
            'currency': 'USD',
            'top_ingredients': []
        }
    ]

    response = client.get("/analytics/year/2025", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data['total_spending'] == 0.0
    assert data['months_with_data'] == 2

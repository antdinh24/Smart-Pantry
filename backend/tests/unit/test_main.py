"""
Unit Tests for Main App Endpoints

Product Manager Note:
- Tests the health check endpoints
- Ensures API is responding correctly
- Fast unit tests (no database calls)
"""

import pytest
from fastapi import status


@pytest.mark.unit
class TestHealthEndpoints:
    """Test suite for health check endpoints"""

    def test_root_endpoint(self, test_client):
        """Test GET / returns healthy status"""
        response = test_client.get("/")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "Smart Pantry API"
        assert "version" in data

    def test_root_endpoint_has_version(self, test_client):
        """Test root endpoint includes API version"""
        response = test_client.get("/")
        data = response.json()

        assert "version" in data
        assert data["version"] == "v1"

    def test_health_check_endpoint(self, test_client):
        """Test GET /health returns OK status"""
        response = test_client.get("/health")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "ok"
        assert "environment" in data

    def test_health_check_environment(self, test_client):
        """Test health check returns environment info"""
        response = test_client.get("/health")
        data = response.json()

        assert "environment" in data
        assert data["environment"] == "testing"

    def test_cors_headers(self, test_client):
        """Test CORS headers are present"""
        response = test_client.options("/")

        # CORS headers should be present
        assert "access-control-allow-origin" in response.headers

    def test_404_endpoint(self, test_client):
        """Test non-existent endpoint returns 404"""
        response = test_client.get("/nonexistent")

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.unit
class TestAPIStructure:
    """Test suite for API structure and metadata"""

    def test_openapi_schema(self, test_client):
        """Test OpenAPI schema is generated"""
        response = test_client.get("/openapi.json")

        assert response.status_code == status.HTTP_200_OK
        schema = response.json()
        assert "openapi" in schema
        assert "info" in schema
        assert schema["info"]["title"] == "Smart Pantry API"

    def test_api_docs_available(self, test_client):
        """Test Swagger docs are available at /docs"""
        response = test_client.get("/docs")

        assert response.status_code == status.HTTP_200_OK
        assert "swagger" in response.text.lower()

    def test_redoc_available(self, test_client):
        """Test ReDoc documentation is available"""
        response = test_client.get("/redoc")

        assert response.status_code == status.HTTP_200_OK
        assert "redoc" in response.text.lower()

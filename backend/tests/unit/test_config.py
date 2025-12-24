"""
Unit Tests for Configuration

Product Manager Note:
- Tests that environment variables load correctly
- Ensures required config is present
- Fast tests (no external dependencies)
"""

import pytest
from app.config import get_settings


@pytest.mark.unit
class TestConfiguration:
    """Test suite for app configuration"""

    def test_settings_load(self, settings):
        """Test that settings load successfully"""
        assert settings is not None
        assert settings.environment == "testing"

    def test_supabase_config(self, settings):
        """Test Supabase configuration is present"""
        assert settings.supabase_url is not None
        assert settings.supabase_url.startswith("https://")
        assert settings.supabase_key is not None
        assert settings.supabase_service_key is not None

    def test_openai_config(self, settings):
        """Test OpenAI configuration is present"""
        assert settings.openai_api_key is not None
        assert len(settings.openai_api_key) > 0

    def test_stripe_config(self, settings):
        """Test Stripe configuration is present"""
        assert settings.stripe_secret_key is not None
        assert settings.stripe_webhook_secret is not None

    def test_api_version(self, settings):
        """Test API version is set"""
        assert settings.api_version == "v1"

    def test_database_url(self, settings):
        """Test database URL is configured"""
        assert settings.database_url is not None
        assert "postgresql://" in settings.database_url

    def test_allowed_origins(self, settings):
        """Test CORS origins are configured"""
        assert settings.allowed_origins is not None
        assert len(settings.allowed_origins) > 0

    def test_environment_values(self, settings):
        """Test environment can only be valid values"""
        valid_environments = ["development", "staging", "production", "testing"]
        assert settings.environment in valid_environments

    def test_settings_cached(self):
        """Test that get_settings returns same instance (cached)"""
        settings1 = get_settings()
        settings2 = get_settings()
        assert settings1 is settings2  # Same object in memory

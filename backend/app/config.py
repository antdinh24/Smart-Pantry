"""
Configuration management for Smart Pantry Backend.
Loads environment variables and provides them to the application.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    Product Manager Note:
    - This reads from the .env file automatically
    - All secrets are kept out of code
    - Easy to switch between development/production
    """

    # Supabase
    supabase_url: str
    supabase_key: str
    supabase_service_key: str

    # OpenAI
    openai_api_key: str

    # Stripe
    stripe_secret_key: str
    stripe_webhook_secret: str

    # App Settings
    environment: str = "development"
    api_version: str = "v1"
    allowed_origins: str = "http://localhost:19006"

    # Database
    database_url: str

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """
    Returns cached settings instance.

    Why cached?
    - We only need to load the .env file once
    - Faster subsequent calls
    """
    return Settings()

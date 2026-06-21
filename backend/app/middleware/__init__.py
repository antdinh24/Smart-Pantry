"""
Middleware for Smart Pantry API.

Product Manager Note:
- Middleware runs on every request
- Handles authentication, logging, etc.
"""

from app.middleware.auth import get_current_user, get_current_user_id

__all__ = ["get_current_user", "get_current_user_id"]

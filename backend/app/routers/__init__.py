"""
API Routers for Smart Pantry.

Product Manager Note:
- Each router handles a specific feature area
- Routers are registered in main.py
"""

from app.routers import auth, pantry, recipes

__all__ = ["auth", "pantry", "recipes"]

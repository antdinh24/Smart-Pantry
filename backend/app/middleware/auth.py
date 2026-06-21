"""
Authentication Middleware

Product Manager Note:
- Validates JWT tokens from Supabase Auth
- Extracts user information from token
- Used as a dependency in protected endpoints

Usage in endpoints:
    @app.get("/protected")
    def protected_route(user_id: str = Depends(get_current_user_id)):
        # user_id is automatically extracted from token
        pass
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from app.config import get_settings
from app.database import get_db
from app.models.user import User
import requests

settings = get_settings()
security = HTTPBearer()


def get_supabase_jwt_secret():
    """
    Get Supabase JWT secret for token validation.

    Product Manager Note:
    - Supabase uses the JWT secret from your project settings
    - This is different from the anon key or service key
    - For validation, we use Supabase's public key endpoint
    """
    # Supabase JWT secret can be found in project settings
    # For now, we'll validate using Supabase's user endpoint
    return settings.supabase_key


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """
    Validate JWT token and extract user ID.

    Product Manager Note:
    - This runs on every protected endpoint call
    - Validates the token with Supabase
    - Returns the user_id if valid, raises 401 if not

    Args:
        credentials: Authorization header (Bearer token)

    Returns:
        user_id: UUID of the authenticated user

    Raises:
        HTTPException: 401 if token is invalid or expired
    """
    token = credentials.credentials

    # Validate token with Supabase
    try:
        # Method 1: Validate using Supabase's getUser endpoint
        # This is the most reliable way as Supabase handles all validation
        from supabase import create_client

        supabase = create_client(settings.supabase_url, settings.supabase_key)

        # Attempt to get user with this token
        response = supabase.auth.get_user(token)

        if not response or not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id = response.user.id
        return str(user_id)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
) -> User:
    """
    Get current user from database.

    Product Manager Note:
    - First validates the token (via get_current_user_id)
    - Then fetches the full user record from database
    - Returns User object with subscription status, etc.

    Args:
        user_id: User ID extracted from JWT token
        db: Database session

    Returns:
        User: Full user object from database

    Raises:
        HTTPException: 404 if user not found in database
    """
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found in database. Please complete registration.",
        )

    return user


def require_premium_subscription(user: User = Depends(get_current_user)) -> User:
    """
    Dependency to require premium subscription.

    Product Manager Note:
    - Use this for premium-only endpoints
    - Automatically checks subscription status
    - Returns 403 if user is not premium

    Usage:
        @app.get("/premium-feature")
        def premium_feature(user: User = Depends(require_premium_subscription)):
            # Only premium users can access this
            pass
    """
    if user.subscription_status not in ["premium", "trial"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This feature requires a premium subscription",
        )

    return user

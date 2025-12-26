"""
Authentication Router

Product Manager Note:
- Handles user registration, login, logout
- Integrates with Supabase Auth
- Syncs user data to our PostgreSQL database

Endpoints:
- POST /api/v1/auth/register - Create new user account
- POST /api/v1/auth/login - Sign in existing user
- POST /api/v1/auth/logout - Sign out user
- GET /api/v1/auth/me - Get current user info
- POST /api/v1/auth/refresh - Refresh access token
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from supabase import create_client
from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.middleware.auth import get_current_user, get_current_user_id
import uuid

settings = get_settings()
router = APIRouter()

# Create Supabase client
supabase = create_client(settings.supabase_url, settings.supabase_key)


# ============================================================
# REQUEST/RESPONSE SCHEMAS
# ============================================================


class RegisterRequest(BaseModel):
    """Request body for user registration"""
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    """Request body for user login"""
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    """Request body for token refresh"""
    refresh_token: str


class AuthResponse(BaseModel):
    """Response for successful authentication"""
    user_id: str
    email: str
    access_token: str
    refresh_token: str
    subscription_status: str


class UserResponse(BaseModel):
    """Response for user information"""
    id: str
    user_id: str
    email: str
    subscription_status: str
    subscription_end_date: str | None
    created_at: str
    updated_at: str


# ============================================================
# ENDPOINTS
# ============================================================


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=AuthResponse)
async def register(
    request: RegisterRequest,
    db: Session = Depends(get_db),
):
    """
    Register a new user account.

    Product Manager Note:
    - Creates user in Supabase Auth (handles password hashing, email verification)
    - Creates user record in our PostgreSQL database
    - Returns JWT tokens for immediate login

    Flow:
    1. Create user in Supabase Auth
    2. Create user record in our database
    3. Return tokens and user info

    Args:
        request: Email and password

    Returns:
        AuthResponse: User info and access tokens

    Raises:
        400: Email already registered
        500: Registration failed
    """
    try:
        # Step 1: Create user in Supabase Auth
        auth_response = supabase.auth.sign_up({
            "email": request.email,
            "password": request.password,
        })

        if not auth_response.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration failed. Email may already be registered.",
            )

        # Step 2: Create user record in our database
        user = User(
            user_id=uuid.UUID(auth_response.user.id),
            email=request.email,
            subscription_status="free",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # Step 3: Return auth response
        return AuthResponse(
            user_id=str(auth_response.user.id),
            email=request.email,
            access_token=auth_response.session.access_token,
            refresh_token=auth_response.session.refresh_token,
            subscription_status=user.subscription_status,
        )

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        # Check if it's a duplicate email error
        if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: {str(e)}",
        )


@router.post("/login", response_model=AuthResponse)
async def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
):
    """
    Log in an existing user.

    Product Manager Note:
    - Validates credentials with Supabase Auth
    - Returns JWT tokens for API access
    - Fetches user's subscription status from our database

    Args:
        request: Email and password

    Returns:
        AuthResponse: User info and access tokens

    Raises:
        401: Invalid credentials
    """
    try:
        # Step 1: Authenticate with Supabase
        auth_response = supabase.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password,
        })

        if not auth_response.user or not auth_response.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        # Step 2: Get user from our database
        user = db.query(User).filter(User.user_id == auth_response.user.id).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found. Please register first.",
            )

        # Step 3: Return auth response
        return AuthResponse(
            user_id=str(auth_response.user.id),
            email=request.email,
            access_token=auth_response.session.access_token,
            refresh_token=auth_response.session.refresh_token,
            subscription_status=user.subscription_status,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Login failed: {str(e)}",
        )


@router.post("/logout")
async def logout(user_id: str = Depends(get_current_user_id)):
    """
    Log out the current user.

    Product Manager Note:
    - Invalidates the user's session in Supabase
    - Frontend should also clear local tokens

    Returns:
        Success message

    Raises:
        401: Invalid or missing token
    """
    try:
        # Sign out from Supabase (invalidates all sessions)
        supabase.auth.sign_out()

        return {
            "status": "success",
            "message": "Logged out successfully",
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Logout failed: {str(e)}",
        )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    """
    Get current user information.

    Product Manager Note:
    - Returns user profile and subscription status
    - Used by frontend to check if user is logged in
    - Protected endpoint (requires valid JWT token)

    Returns:
        UserResponse: Current user's information

    Raises:
        401: Invalid or missing token
        404: User not found
    """
    return UserResponse(**user.to_dict())


@router.post("/refresh", response_model=AuthResponse)
async def refresh_token(
    request: RefreshRequest,
    db: Session = Depends(get_db),
):
    """
    Refresh access token using refresh token.

    Product Manager Note:
    - Access tokens expire after 1 hour (Supabase default)
    - Refresh tokens are long-lived (can be used to get new access tokens)
    - Frontend should call this when access token expires

    Args:
        request: Refresh token

    Returns:
        AuthResponse: New access and refresh tokens

    Raises:
        401: Invalid or expired refresh token
    """
    try:
        # Refresh session with Supabase
        auth_response = supabase.auth.refresh_session(request.refresh_token)

        if not auth_response.user or not auth_response.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
            )

        # Get user from database
        user = db.query(User).filter(User.user_id == auth_response.user.id).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        return AuthResponse(
            user_id=str(auth_response.user.id),
            email=user.email,
            access_token=auth_response.session.access_token,
            refresh_token=auth_response.session.refresh_token,
            subscription_status=user.subscription_status,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token refresh failed: {str(e)}",
        )

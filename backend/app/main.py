"""
Smart Pantry FastAPI Backend

This is the main entry point for the backend server.
All API routes are registered here.

Product Manager Note:
- This file starts the web server
- It handles CORS (allows React Native app to call APIs)
- Routes are organized in separate files (routers/)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings

settings = get_settings()

# Create FastAPI application
app = FastAPI(
    title="Smart Pantry API",
    description="Backend API for Smart Pantry mobile app",
    version=settings.api_version,
)

# CORS Configuration - allows React Native app to make requests
origins = settings.allowed_origins.split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check endpoint
@app.get("/")
async def root():
    """
    Basic health check endpoint.
    Returns: Status message confirming API is running
    """
    return {
        "status": "healthy",
        "service": "Smart Pantry API",
        "version": settings.api_version,
    }


@app.get("/health")
async def health_check():
    """
    Detailed health check for monitoring.
    """
    return {
        "status": "ok",
        "environment": settings.environment,
    }


# Register API routers
from app.routers import auth, pantry, recipes, receipts, ingredients, analytics

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(pantry.router, prefix="/api/v1/pantry", tags=["pantry"])
app.include_router(recipes.router, prefix="/api/v1/recipes", tags=["recipes"])
app.include_router(receipts.router, prefix="/api/v1/receipts", tags=["receipts"])
app.include_router(ingredients.router, prefix="/api/v1/ingredients", tags=["ingredients"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])

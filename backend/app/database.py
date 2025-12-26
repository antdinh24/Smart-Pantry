"""
Database connection and session management.

Product Manager Note:
- Connects to Supabase PostgreSQL
- Provides database sessions for API requests
- Handles connection pooling automatically
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import get_settings

settings = get_settings()

# Create SQLAlchemy engine
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,  # Verify connections before using
    pool_size=5,         # Max number of connections
    max_overflow=10,     # Max connections beyond pool_size
)

# Create SessionLocal class for database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all models
Base = declarative_base()


def get_db():
    """
    Dependency function to get database session.

    Usage in FastAPI endpoints:
        @app.get("/example")
        def example(db: Session = Depends(get_db)):
            # Use db here
            pass

    Why this pattern?
    - FastAPI automatically creates a new session for each request
    - Session is closed after the request completes
    - Prevents connection leaks
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

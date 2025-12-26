"""
Migration Runner Script

Product Manager Note:
- Runs all SQL migration files in order
- Creates database tables in Supabase
- Only needs to be run once (or when new migrations are added)

Usage:
    python run_migrations.py
"""

import os
from pathlib import Path
from supabase import create_client
from app.config import get_settings

settings = get_settings()

# Create Supabase client with service key (admin access)
supabase = create_client(
    settings.supabase_url,
    settings.supabase_service_key  # Service key has admin access
)


def run_migrations():
    """Execute all migration files in order"""
    migrations_dir = Path(__file__).parent / "migrations"
    migration_files = sorted(migrations_dir.glob("*.sql"))

    print(f"Found {len(migration_files)} migration files")
    print("-" * 60)

    for migration_file in migration_files:
        print(f"\nRunning: {migration_file.name}")

        # Read migration SQL
        with open(migration_file, 'r') as f:
            sql = f.read()

        try:
            # Execute migration using Supabase's SQL execution
            # Note: Supabase client doesn't have direct SQL execution,
            # so we'll use psycopg2 directly
            import psycopg2

            # Parse DATABASE_URL to get connection params
            conn = psycopg2.connect(settings.database_url)
            cursor = conn.cursor()

            # Execute the migration
            cursor.execute(sql)
            conn.commit()

            print(f"✓ Success: {migration_file.name}")

            cursor.close()
            conn.close()

        except Exception as e:
            print(f"✗ Error in {migration_file.name}: {e}")
            raise

    print("\n" + "=" * 60)
    print("All migrations completed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_migrations()

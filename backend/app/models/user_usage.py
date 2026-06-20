"""
user_usage.py

PURPOSE:
    SQLAlchemy model for the user_usage table.
    Tracks how many free-tier actions each user has consumed this month.

WHY A SEPARATE TABLE (not columns on users)?
    - Keeps identity data (users) separate from billing/usage data
    - Zero risk of breaking existing user rows during migration
    - Easy to extend — adding limits for new features is one new column here,
      not a change to the core users table

MONTHLY RESET LOGIC:
    Each row has a reset_date (the first day of the month the counters
    cover). When today > reset_date, UsageService.get_or_create() advances
    reset_date to the first of the current month and zeros the counters.
    No cron job needed — the reset happens lazily on the next usage check.

FREE TIER LIMITS (enforced in UsageService):
    receipt_scans_this_month      <= 8
    recipe_generations_this_month <= 10  (cache hits don't count)
"""

from sqlalchemy import Column, Integer, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
from datetime import date


class UserUsage(Base):
    """
    Usage counters for a single user for the current billing month.

    One row per user. Created on first usage check via UsageService.get_or_create().

    Attributes:
        user_id                       — UUID FK to the users table, also the PK.
                                        One row per user, so user_id is both FK and PK.
        receipt_scans_this_month      — How many receipt images this user has sent
                                        to GPT-4o vision this month.
        recipe_generations_this_month — How many times GPT-4o was actually called for
                                        recipe generation this month. Cache hits are free
                                        and do NOT increment this counter.
        reset_date                    — The first day of the month these counters cover.
                                        When today > reset_date, both counters are zeroed
                                        and this date is advanced to today's month start.
    """

    __tablename__ = "user_usage"

    # user_id is both the primary key and a foreign key to the users table.
    # Using it as PK enforces one row per user at the database level.
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )

    # Receipt scan counter — capped at 8/month for free tier
    receipt_scans_this_month = Column(Integer, nullable=False, default=0)

    # Recipe generation counter — capped at 10/month for free tier.
    # Only incremented when GPT-4o is actually called (not on cache hits).
    recipe_generations_this_month = Column(Integer, nullable=False, default=0)

    # The first day of the month these counters cover.
    # Example: if today is 2025-04-15, reset_date is 2025-04-01.
    # When UsageService sees today > reset_date, it resets and advances this date.
    reset_date = Column(Date, nullable=False, default=lambda: date.today().replace(day=1))

    def __repr__(self):
        return (
            f"<UserUsage user={self.user_id} "
            f"scans={self.receipt_scans_this_month} "
            f"recipes={self.recipe_generations_this_month} "
            f"reset={self.reset_date}>"
        )

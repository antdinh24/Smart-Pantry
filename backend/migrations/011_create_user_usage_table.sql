/*
  User Usage Table — 011_create_user_usage_table.sql

  PURPOSE:
    Tracks how many free-tier actions each user has consumed in the current
    calendar month. Enforces the monthly limits:
      - 8 receipt scans  (GPT-4o vision calls)
      - 10 recipe generations  (GPT-4o text calls; cache hits are free and NOT counted)

  WHY A SEPARATE TABLE (not columns on users)?
    - Keeps identity data (users) separate from billing/usage data.
    - Zero risk of breaking existing user rows during migration — this table
      can be added at any time without touching the users table.
    - Easy to extend: adding a new limit (e.g. barcode lookups) is one new
      column here, not a schema change on a core table.

  HOW MONTHLY RESET WORKS:
    There is NO cron job. Instead, UsageService.get_or_create() checks
    reset_date on every read. If today > reset_date, it zeroes both counters
    and sets reset_date to the first of the current month ("lazy reset").
    This means the reset happens automatically the first time a user does
    anything in a new month.

  RLS POLICY DESIGN:
    Users can SELECT their own row (useful for displaying "6/8 scans used"),
    but cannot INSERT, UPDATE, or DELETE it. All writes go through the
    FastAPI backend using the service role key, which bypasses RLS entirely.
    This prevents a user from resetting their own limits by writing directly
    to the Supabase REST API.

  FK INDIRECTION:
    user_usage.user_id → users.id (our custom users table's PK)
    users.user_id      → auth.users(id) (Supabase's built-in auth table)

    So auth.uid() identifies the Supabase auth user, which maps to a row in
    our users table via users.user_id = auth.uid(). The RLS SELECT policy
    therefore uses a subquery rather than a direct comparison.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_usage (

    -- Primary key AND foreign key: one row per user.
    -- Using user_id as the PK enforces the one-row-per-user constraint at the
    -- database level, making it impossible to accidentally create duplicates.
    -- ON DELETE CASCADE means the usage row is automatically removed if the
    -- user account is deleted.
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE NOT NULL,

    -- How many receipt images this user has sent to GPT-4o vision this month.
    -- Capped at 8 by UsageService.check_receipt_limit().
    receipt_scans_this_month INTEGER NOT NULL DEFAULT 0,

    -- How many times GPT-4o was actually called for recipe generation this month.
    -- Cache hits (Jaccard similarity >= 0.80) are FREE and do NOT increment this.
    -- Capped at 10 by UsageService.check_recipe_limit().
    recipe_generations_this_month INTEGER NOT NULL DEFAULT 0,

    -- The first day of the month these counters cover.
    -- Example: if today is 2025-04-15, this is 2025-04-01.
    -- When UsageService reads a row and sees today > reset_date, it zeros both
    -- counters and advances reset_date to the first of the current month.
    reset_date DATE NOT NULL DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,

    -- Safety constraint: counters can never go negative (a bug should not
    -- be able to produce a negative count that would grant extra uses).
    CONSTRAINT receipt_scans_non_negative CHECK (receipt_scans_this_month >= 0),
    CONSTRAINT recipe_generations_non_negative CHECK (recipe_generations_this_month >= 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS so direct Supabase REST API calls are subject to policies.
-- The FastAPI backend uses the service role key and is NEVER blocked by RLS.
ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;

-- SELECT: users can read their own usage row (e.g. to display "6/8 scans used").
--
-- WHY a subquery instead of auth.uid() = user_id?
--   user_usage.user_id references users.id (our custom users table PK).
--   auth.uid() returns the Supabase auth UID, which lives in users.user_id.
--   We therefore look up the custom users.id that corresponds to the current
--   Supabase auth session before comparing.
CREATE POLICY "Users can view own usage" ON user_usage
    FOR SELECT USING (
        user_id IN (
            SELECT id FROM users WHERE user_id = auth.uid()
        )
    );

-- No INSERT / UPDATE / DELETE policies for regular users.
-- All writes go through the FastAPI service role, which bypasses RLS.
-- This prevents users from resetting their own monthly counters.

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMENTS
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE user_usage IS
    'Monthly usage counters per user for free-tier rate limiting. '
    'Lazily reset by UsageService on first access each month — no cron job needed.';

COMMENT ON COLUMN user_usage.user_id IS
    'FK to users.id (our custom users table). One row per user.';

COMMENT ON COLUMN user_usage.receipt_scans_this_month IS
    'GPT-4o vision calls made this month. Capped at 8 for free tier.';

COMMENT ON COLUMN user_usage.recipe_generations_this_month IS
    'GPT-4o recipe generation calls this month. Cache hits do not count. Capped at 10.';

COMMENT ON COLUMN user_usage.reset_date IS
    'First day of the month these counters cover. When today > reset_date, '
    'UsageService zeros both counters and advances this to the current month start.';

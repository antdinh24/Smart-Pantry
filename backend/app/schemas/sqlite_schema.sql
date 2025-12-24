/*
  SQLite Schema for Smart Pantry Mobile App

  Purpose: Offline-first storage on user's device

  Product Manager Note:
  - This database runs entirely on the user's phone
  - Works even without internet connection
  - Syncs to Supabase when online
  - sync_status tracks what needs uploading
*/

-- ============================================================
-- PANTRY ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS pantry_items (
    id TEXT PRIMARY KEY,                 -- UUID generated on device
    user_id TEXT NOT NULL,
    ingredient_name TEXT NOT NULL,
    normalized_name TEXT,                -- Matches ingredients table
    quantity REAL NOT NULL,
    unit TEXT,                           -- "cups", "grams", "count"
    category TEXT,                       -- "produce", "dairy", etc.
    expiration_date TEXT,                -- ISO 8601 format: "2024-01-15"
    location TEXT,                       -- "fridge", "pantry", "freezer"
    barcode TEXT,
    added_date TEXT DEFAULT (datetime('now')),
    last_updated TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('synced', 'pending', 'conflict')),
    deleted INTEGER DEFAULT 0            -- Soft delete (1 = deleted)
);

CREATE INDEX idx_pantry_user_id ON pantry_items(user_id);
CREATE INDEX idx_pantry_sync_status ON pantry_items(sync_status);
CREATE INDEX idx_pantry_normalized_name ON pantry_items(normalized_name);

-- ============================================================
-- RECIPES TABLE (CACHED)
-- ============================================================
CREATE TABLE IF NOT EXISTS recipes_cache (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    ingredient_list TEXT,                -- JSON string
    instructions TEXT,                   -- JSON string
    prep_time_minutes INTEGER,
    cook_time_minutes INTEGER,
    servings INTEGER,
    difficulty TEXT,
    cuisine_type TEXT,
    meal_type TEXT,
    is_ai_generated INTEGER DEFAULT 0,
    source_type TEXT,
    nutritional_info TEXT,               -- JSON string
    is_favorite INTEGER DEFAULT 0,       -- Local-only flag
    match_percentage REAL,               -- % of ingredients user has
    last_viewed TEXT,                    -- Track recent recipes
    created_at TEXT,
    sync_status TEXT DEFAULT 'synced',
    deleted INTEGER DEFAULT 0
);

CREATE INDEX idx_recipes_user_id ON recipes_cache(user_id);
CREATE INDEX idx_recipes_favorite ON recipes_cache(is_favorite);
CREATE INDEX idx_recipes_meal_type ON recipes_cache(meal_type);

-- ============================================================
-- GROCERY LIST TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS grocery_list (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ingredient_name TEXT NOT NULL,
    normalized_name TEXT,
    quantity REAL,
    unit TEXT,
    recipe_id TEXT,                      -- Optional: which recipe needs this?
    is_checked INTEGER DEFAULT 0,        -- User checked it off in store
    priority INTEGER DEFAULT 0,          -- Sort order
    notes TEXT,
    added_date TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'pending',
    deleted INTEGER DEFAULT 0
);

CREATE INDEX idx_grocery_user_id ON grocery_list(user_id);
CREATE INDEX idx_grocery_checked ON grocery_list(is_checked);

-- ============================================================
-- RECEIPTS TABLE (OFFLINE)
-- ============================================================
CREATE TABLE IF NOT EXISTS receipts_offline (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    merchant_name TEXT,
    purchase_date TEXT,
    total_amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    line_items TEXT,                     -- JSON string
    image_path TEXT,                     -- Local file path
    ocr_confidence REAL,
    processed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'pending',
    deleted INTEGER DEFAULT 0
);

CREATE INDEX idx_receipts_user_id ON receipts_offline(user_id);
CREATE INDEX idx_receipts_processed ON receipts_offline(processed);
CREATE INDEX idx_receipts_date ON receipts_offline(purchase_date);

-- ============================================================
-- MEAL SCHEDULE TABLE (LOCAL ONLY)
-- ============================================================
CREATE TABLE IF NOT EXISTS meal_schedule (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    recipe_id TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,        -- "2024-01-15"
    meal_type TEXT,                      -- "breakfast", "lunch", "dinner"
    is_completed INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    sync_status TEXT DEFAULT 'pending',
    deleted INTEGER DEFAULT 0
);

CREATE INDEX idx_schedule_user_id ON meal_schedule(user_id);
CREATE INDEX idx_schedule_date ON meal_schedule(scheduled_date);

-- ============================================================
-- SYNC QUEUE TABLE
-- ============================================================
-- Tracks operations that need syncing to Supabase
CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    data TEXT,                           -- JSON payload
    created_at TEXT DEFAULT (datetime('now')),
    retry_count INTEGER DEFAULT 0,
    last_error TEXT
);

CREATE INDEX idx_sync_queue_table ON sync_queue(table_name);
CREATE INDEX idx_sync_queue_created ON sync_queue(created_at);

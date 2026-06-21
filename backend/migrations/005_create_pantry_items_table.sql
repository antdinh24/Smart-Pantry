/*
  Pantry Items Table

  Purpose: Stores user's pantry inventory in the cloud

  Product Manager Note:
  - Syncs with mobile app's SQLite database
  - Tracks what ingredients user has at home
  - Used for recipe matching
  - Supports expiration tracking
*/

CREATE TABLE IF NOT EXISTS pantry_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

    -- Ingredient information
    ingredient_name TEXT NOT NULL,
    normalized_name TEXT,                -- Normalized for matching (lowercase, singular)

    -- Quantity information
    quantity REAL NOT NULL DEFAULT 1.0,
    unit TEXT,                           -- "cups", "grams", "count", "oz", etc.

    -- Categorization
    category TEXT,                       -- "produce", "dairy", "meat", "pantry", etc.
    location TEXT,                       -- "fridge", "pantry", "freezer"

    -- Tracking
    barcode TEXT,                        -- Product barcode for easy re-adding
    expiration_date DATE,                -- For freshness tracking

    -- Timestamps
    added_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Soft delete (for sync purposes)
    deleted BOOLEAN DEFAULT FALSE
);

-- Indexes for fast lookups
CREATE INDEX idx_pantry_items_user_id ON pantry_items(user_id);
CREATE INDEX idx_pantry_items_normalized_name ON pantry_items(normalized_name);
CREATE INDEX idx_pantry_items_category ON pantry_items(category);
CREATE INDEX idx_pantry_items_expiration ON pantry_items(expiration_date);
CREATE INDEX idx_pantry_items_deleted ON pantry_items(deleted) WHERE deleted = FALSE;

-- Enable Row Level Security
ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own pantry items
CREATE POLICY "Users can view own pantry items" ON pantry_items
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pantry items" ON pantry_items
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pantry items" ON pantry_items
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pantry items" ON pantry_items
    FOR DELETE USING (auth.uid() = user_id);

-- Trigger to update last_updated timestamp
CREATE OR REPLACE FUNCTION update_pantry_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pantry_items_timestamp
    BEFORE UPDATE ON pantry_items
    FOR EACH ROW
    EXECUTE FUNCTION update_pantry_items_updated_at();

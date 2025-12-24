/*
  Ingredients Table (Normalized)

  Purpose: Master list of ingredient names and categories for consistency

  Product Manager Note:
  - This ensures "tomatoes" and "Tomatoes" are treated as the same ingredient
  - Helps with pantry matching ("Do I have this?")
  - common_name is what users see (e.g., "tomato")
  - normalized_name is lowercase for matching (e.g., "tomato")
  - category helps with grouping (produce, dairy, meat, etc.)
*/

CREATE TABLE IF NOT EXISTS ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    common_name TEXT NOT NULL,           -- "Tomato"
    normalized_name TEXT UNIQUE NOT NULL, -- "tomato" (lowercase)
    category TEXT,                        -- "produce", "dairy", "meat", etc.
    aliases JSONB,                        -- ["tomatoes", "cherry tomatoes"]
    default_unit TEXT,                    -- "cups", "grams", "count"
    barcode TEXT,                         -- Optional: from OpenFoodFacts
    openfoodfacts_id TEXT,               -- Link to product database
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups by normalized name
CREATE INDEX idx_ingredients_normalized_name ON ingredients(normalized_name);

-- Index for category filtering
CREATE INDEX idx_ingredients_category ON ingredients(category);

-- Full-text search on names and aliases
CREATE INDEX idx_ingredients_search ON ingredients USING gin(to_tsvector('english', common_name || ' ' || COALESCE(aliases::text, '')));

-- This table is read-only for users (managed by backend)
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view ingredients" ON ingredients
    FOR SELECT USING (true);

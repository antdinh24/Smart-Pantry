/*
  Ingredient Cache Table

  Purpose: Cache most commonly used ingredients from OpenFoodFacts
  - Speeds up manual search
  - Reduces API calls
  - Provides offline functionality

  Product Manager Note:
  - This is SHARED data across all users (no RLS)
  - Populated from OpenFoodFacts API
  - Top 5000+ ingredients cached
  - Updated when users search for new ingredients
*/

CREATE TABLE IF NOT EXISTS ingredient_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_name TEXT NOT NULL,           -- e.g., "Whole Milk", "Organic Eggs"
    normalized_name TEXT NOT NULL,           -- lowercase, singular: "milk", "egg"
    category TEXT NOT NULL,                  -- "dairy", "produce", "protein", etc.
    barcode TEXT,                            -- if known from OpenFoodFacts
    popularity INT DEFAULT 0,                -- usage count across all users
    source TEXT DEFAULT 'openfoodfacts',     -- where data came from
    extra_data JSONB,                        -- additional info (brands, images, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast normalized name lookup
CREATE INDEX idx_ingredient_cache_normalized ON ingredient_cache(normalized_name);

-- Full-text search index for ingredient names
CREATE INDEX idx_ingredient_cache_name_fts ON ingredient_cache USING gin(to_tsvector('english', ingredient_name));

-- Index for category filtering
CREATE INDEX idx_ingredient_cache_category ON ingredient_cache(category);

-- Index for popularity sorting (most popular first)
CREATE INDEX idx_ingredient_cache_popularity ON ingredient_cache(popularity DESC);

-- Index for barcode lookup (sparse index - only where barcode exists)
CREATE INDEX idx_ingredient_cache_barcode ON ingredient_cache(barcode) WHERE barcode IS NOT NULL;

-- No RLS - this is shared data across all users
COMMENT ON TABLE ingredient_cache IS 'Shared ingredient cache from OpenFoodFacts API - no user-specific data';

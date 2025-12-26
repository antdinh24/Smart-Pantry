/*
  Recipe Caching Enhancement

  Purpose: Add fields to support intelligent recipe caching

  Product Manager Note:
  - ingredient_hash: Normalized hash of ingredient list for cache matching
  - is_public: Allows recipe sharing across users (for caching)
  - usage_count: Tracks how many times recipe was used (popularity)
  - generation_params: Stores preferences used to generate recipe
  - This minimizes OpenAI API calls by reusing similar recipes
*/

-- Add caching fields to existing recipes table
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS ingredient_hash TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS generation_params JSONB;

-- Index for fast cache lookups by ingredient hash
CREATE INDEX IF NOT EXISTS idx_recipes_ingredient_hash ON recipes(ingredient_hash);

-- Index for finding public recipes (cached recipes available to all)
CREATE INDEX IF NOT EXISTS idx_recipes_public ON recipes(is_public) WHERE is_public = TRUE;

-- Index for popular recipes (frequently used cached recipes)
CREATE INDEX IF NOT EXISTS idx_recipes_usage_count ON recipes(usage_count DESC);

-- Composite index for cache matching (hash + public + AI-generated)
CREATE INDEX IF NOT EXISTS idx_recipes_cache_lookup
    ON recipes(ingredient_hash, is_public, is_ai_generated)
    WHERE is_public = TRUE AND is_ai_generated = TRUE;

-- Update RLS policies to allow reading public recipes
DROP POLICY IF EXISTS "Users can view own recipes" ON recipes;

CREATE POLICY "Users can view own and public recipes" ON recipes
    FOR SELECT USING (auth.uid() = user_id OR is_public = TRUE);

-- Function to increment usage count
CREATE OR REPLACE FUNCTION increment_recipe_usage(recipe_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE recipes
    SET usage_count = usage_count + 1,
        updated_at = NOW()
    WHERE id = recipe_id;
END;
$$ LANGUAGE plpgsql;

-- Comment explaining the caching strategy
COMMENT ON COLUMN recipes.ingredient_hash IS 'SHA256 hash of normalized, sorted ingredient list for cache matching';
COMMENT ON COLUMN recipes.is_public IS 'If true, recipe is available to all users as a cached recipe';
COMMENT ON COLUMN recipes.usage_count IS 'Number of times this recipe was used (for popularity ranking)';
COMMENT ON COLUMN recipes.generation_params IS 'Original parameters used to generate recipe (cuisine, difficulty, etc.)';

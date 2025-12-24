/*
  Recipes Table (Shared)

  Purpose: Stores both AI-generated and user-uploaded recipes

  Product Manager Note:
  - is_ai_generated: tracks if recipe came from GPT
  - source_type: manual upload vs AI vs barcode-scanned recipe
  - ingredient_list: JSONB allows flexible storage (arrays/objects)
  - nutritional_info: optional field for future features
*/

CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    ingredient_list JSONB NOT NULL, -- [{"name": "tomato", "quantity": "2", "unit": "cups"}]
    instructions JSONB NOT NULL,    -- [{"step": 1, "text": "Chop tomatoes"}]
    prep_time_minutes INTEGER,
    cook_time_minutes INTEGER,
    servings INTEGER DEFAULT 1,
    difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
    cuisine_type TEXT,              -- e.g., "Italian", "Mexican"
    meal_type TEXT,                 -- e.g., "breakfast", "dinner"
    is_ai_generated BOOLEAN DEFAULT FALSE,
    source_type TEXT CHECK (source_type IN ('ai', 'manual', 'photo', 'video')),
    nutritional_info JSONB,         -- {"calories": 300, "protein": "20g"}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for user's recipes
CREATE INDEX idx_recipes_user_id ON recipes(user_id);

-- Index for filtering by meal type (breakfast, lunch, dinner)
CREATE INDEX idx_recipes_meal_type ON recipes(meal_type);

-- Index for AI-generated recipes (for analytics)
CREATE INDEX idx_recipes_ai_generated ON recipes(is_ai_generated);

-- Full-text search on title and description (for recipe search)
CREATE INDEX idx_recipes_search ON recipes USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- Row Level Security
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recipes" ON recipes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recipes" ON recipes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recipes" ON recipes
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own recipes" ON recipes
    FOR DELETE USING (auth.uid() = user_id);

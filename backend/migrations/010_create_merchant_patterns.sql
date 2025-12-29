/*
  Merchant Patterns Table (Phase 1)

  Purpose: Store merchant detection patterns for receipt OCR parsing
  - Database-backed patterns (dynamic, user-contributed)
  - Tracks usage and verification
  - Supports tiered matching (promoted patterns get priority)

  Product Manager Note:
  - Seeded with default patterns on startup
  - Phase 1: Tiered pattern matching (promoted → hardcoded → all DB → fallback)
  - Phase 2: User learning (merchant_corrections table added later)
  - Phase 3: ML model training from correction data
*/

CREATE TABLE IF NOT EXISTS merchant_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_name TEXT NOT NULL,                -- Normalized name: "Whole Foods"
    regex_pattern TEXT NOT NULL UNIQUE,         -- Pattern: r'whole\s*foods?'
    raw_variants JSONB DEFAULT '[]'::jsonb,     -- OCR variations: ["WHOLE FOODS", "WHL FDS"]
    usage_count INT DEFAULT 0,                  -- How many times this pattern matched
    verified_count INT DEFAULT 0,               -- How many times users confirmed (Phase 2)
    created_by TEXT DEFAULT 'system',           -- 'system' | 'user_learning' | 'admin'
    confidence_score DECIMAL(3,2) DEFAULT 1.0,  -- 0.0 to 1.0
    is_active BOOLEAN DEFAULT TRUE,             -- Can be disabled if causing false positives
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used TIMESTAMP WITH TIME ZONE
);

-- Index for promoted patterns (verified_count >= 100) - checked first
CREATE INDEX idx_merchant_patterns_promoted ON merchant_patterns(verified_count DESC, confidence_score DESC)
    WHERE is_active = TRUE AND verified_count >= 100;

-- Index for active patterns (all DB patterns fallback)
CREATE INDEX idx_merchant_patterns_active ON merchant_patterns(is_active) WHERE is_active = TRUE;

-- Index for usage tracking and analytics
CREATE INDEX idx_merchant_patterns_usage ON merchant_patterns(usage_count DESC);

-- Index for searching by merchant name
CREATE INDEX idx_merchant_patterns_name ON merchant_patterns(merchant_name);

-- No RLS - this is shared data across all users (similar to ingredient_cache)
COMMENT ON TABLE merchant_patterns IS 'Shared merchant detection patterns - tiered matching for reliability';

-- Seed with default patterns (national chains - these work 80%+ of the time)
INSERT INTO merchant_patterns (merchant_name, regex_pattern, created_by, confidence_score) VALUES
    ('Walmart', 'walmart', 'system', 1.0),
    ('Whole Foods', 'whole\s*foods?', 'system', 1.0),
    ('Target', 'target', 'system', 1.0),
    ('Kroger', 'kroger', 'system', 1.0),
    ('Safeway', 'safeway', 'system', 1.0),
    ('Trader Joe''s', 'trader\s*joe''?s?', 'system', 1.0),
    ('Costco', 'costco', 'system', 1.0),
    ('Publix', 'publix', 'system', 1.0),
    ('Wegmans', 'wegmans', 'system', 1.0),
    ('Aldi', 'aldi', 'system', 1.0),
    ('H-E-B', 'h\s*e\s*b', 'system', 1.0),
    ('Food Lion', 'food\s*lion', 'system', 1.0),
    ('Giant Eagle', 'giant\s*eagle', 'system', 1.0),
    ('Stop & Shop', 'stop\s*&?\s*shop', 'system', 1.0),
    ('Fred Meyer', 'fred\s*meyer', 'system', 1.0)
ON CONFLICT (regex_pattern) DO NOTHING;  -- Don't overwrite if migration runs multiple times

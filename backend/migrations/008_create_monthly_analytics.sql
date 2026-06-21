/*
  Monthly Analytics Table

  Purpose: Track monthly spending and top ingredients
  - Privacy-focused: NO receipt images stored
  - Aggregated data only
  - Used for budget tracking

  Product Manager Note:
  - Stores ONLY monthly totals and top 10 ingredients
  - Does NOT store individual receipt data
  - Privacy-compliant analytics
*/

CREATE TABLE IF NOT EXISTS monthly_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    month TEXT NOT NULL,                     -- "2025-01" format
    total_spending DECIMAL(10, 2) DEFAULT 0, -- Monthly total
    currency TEXT DEFAULT 'USD',
    top_ingredients JSONB,                   -- [{"name": "milk", "count": 5, "total_spent": 15.99}]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One record per user per month
    UNIQUE(user_id, month)
);

-- Index for user queries
CREATE INDEX idx_monthly_analytics_user_month ON monthly_analytics(user_id, month);

-- Index for date range queries
CREATE INDEX idx_monthly_analytics_month ON monthly_analytics(month);

-- Row Level Security
ALTER TABLE monthly_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analytics" ON monthly_analytics
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analytics" ON monthly_analytics
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analytics" ON monthly_analytics
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own analytics" ON monthly_analytics
    FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE monthly_analytics IS 'Privacy-focused monthly analytics - aggregated data only, no images';

/*
  Users Table

  Purpose: Stores user account information and subscription status

  Product Manager Note:
  - user_id links to Supabase Auth (automatic user management)
  - subscription_status tracks if user is premium
  - created_at helps track user growth over time
*/

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'premium', 'trial')),
    subscription_end_date TIMESTAMP WITH TIME ZONE,
    stripe_customer_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookups by user_id (used on every API call)
CREATE INDEX idx_users_user_id ON users(user_id);

-- Index for subscription queries (used for feature gating)
CREATE INDEX idx_users_subscription_status ON users(subscription_status);

-- Enable Row Level Security (RLS)
-- Users can only see their own data
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own data" ON users
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own data" ON users
    FOR UPDATE USING (auth.uid() = user_id);

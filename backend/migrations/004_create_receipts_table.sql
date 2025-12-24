/*
  Receipts Table

  Purpose: Stores scanned receipt data for budget tracking

  Product Manager Note:
  - line_items: individual purchases on the receipt
  - total_amount: used for monthly budget calculations
  - image_url: stored in Supabase Storage (user can review later)
  - merchant_name: extracted from OCR (e.g., "Walmart")
*/

CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    merchant_name TEXT,                  -- e.g., "Walmart", "Whole Foods"
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_amount DECIMAL(10, 2) NOT NULL, -- e.g., 45.67
    currency TEXT DEFAULT 'USD',
    line_items JSONB,                    -- [{"item": "milk", "price": 3.99, "quantity": 1}]
    image_url TEXT,                      -- Link to Supabase Storage
    ocr_confidence DECIMAL(3, 2),        -- 0.0 to 1.0 (how accurate was the scan?)
    processed BOOLEAN DEFAULT FALSE,     -- Has this been added to pantry?
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for user's receipts
CREATE INDEX idx_receipts_user_id ON receipts(user_id);

-- Index for date range queries (monthly budget reports)
CREATE INDEX idx_receipts_purchase_date ON receipts(purchase_date);

-- Index for unprocessed receipts (pending user confirmation)
CREATE INDEX idx_receipts_processed ON receipts(processed);

-- Row Level Security
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own receipts" ON receipts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own receipts" ON receipts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own receipts" ON receipts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own receipts" ON receipts
    FOR DELETE USING (auth.uid() = user_id);

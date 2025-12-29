/*
  Update Receipts Table

  Purpose: Remove image_url to comply with privacy requirements
  - NO receipt images stored
  - Only OCR text and extracted data

  Product Manager Note:
  - Removes image_url column (privacy compliance)
  - Adds notes column for user reference
*/

-- Remove image_url column (privacy requirement - no image storage)
ALTER TABLE receipts DROP COLUMN IF EXISTS image_url;

-- Add notes column for user reference
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS notes TEXT;

-- Update table comment
COMMENT ON TABLE receipts IS 'Stores receipt data WITHOUT images (privacy compliance)';

-- Add reserved_for column to deals table
ALTER TABLE deals ADD COLUMN IF NOT EXISTS reserved_for text DEFAULT NULL;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_deals_reserved_for ON deals (reserved_for) WHERE reserved_for IS NOT NULL;
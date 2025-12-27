-- Run this in your PRODUCTION database to add missing columns
-- This will make the production schema match development

-- Investment Firms - Add missing columns
ALTER TABLE investment_firms ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE investment_firms ADD COLUMN IF NOT EXISTS enrichment_status text DEFAULT 'not_enriched';
ALTER TABLE investment_firms ADD COLUMN IF NOT EXISTS last_enrichment_date timestamp;

-- Investors - Add missing columns (if any are missing)
ALTER TABLE investors ADD COLUMN IF NOT EXISTS enrichment_status text DEFAULT 'not_enriched';
ALTER TABLE investors ADD COLUMN IF NOT EXISTS last_enrichment_date timestamp;

-- Verify the columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'investment_firms' 
ORDER BY ordinal_position;

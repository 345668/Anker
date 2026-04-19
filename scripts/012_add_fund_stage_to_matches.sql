-- Add fund_stage column to investor_matches table for Fund I-IV and Venture Studio tracking
-- This enables the fund-stage-aware matchmaking engine

-- Add fund_stage column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'investor_matches' AND column_name = 'fund_stage'
    ) THEN
        ALTER TABLE investor_matches ADD COLUMN fund_stage VARCHAR(50);
    END IF;
END $$;

-- Add fund_stage_label column for display purposes
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'investor_matches' AND column_name = 'fund_stage_label'
    ) THEN
        ALTER TABLE investor_matches ADD COLUMN fund_stage_label VARCHAR(100);
    END IF;
END $$;

-- Add factors_json column to store detailed factor breakdown
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'investor_matches' AND column_name = 'factors_json'
    ) THEN
        ALTER TABLE investor_matches ADD COLUMN factors_json JSONB;
    END IF;
END $$;

-- Add bonuses_json column to store bonus modifiers
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'investor_matches' AND column_name = 'bonuses_json'
    ) THEN
        ALTER TABLE investor_matches ADD COLUMN bonuses_json JSONB;
    END IF;
END $$;

-- Add flags column for soft warnings
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'investor_matches' AND column_name = 'flags'
    ) THEN
        ALTER TABLE investor_matches ADD COLUMN flags TEXT[];
    END IF;
END $$;

-- Add founder_background column to startups for operator fit scoring
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'startups' AND column_name = 'founder_background'
    ) THEN
        ALTER TABLE startups ADD COLUMN founder_background TEXT;
    END IF;
END $$;

-- Add product_readiness column to startups for fund stage matching
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'startups' AND column_name = 'product_readiness'
    ) THEN
        ALTER TABLE startups ADD COLUMN product_readiness VARCHAR(50);
    END IF;
END $$;

-- Add coachability_signals column for venture studio matching
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'startups' AND column_name = 'coachability_signals'
    ) THEN
        ALTER TABLE startups ADD COLUMN coachability_signals TEXT;
    END IF;
END $$;

-- Create index on fund_stage for faster filtering
CREATE INDEX IF NOT EXISTS idx_investor_matches_fund_stage ON investor_matches(fund_stage);

-- Update comment
COMMENT ON COLUMN investor_matches.fund_stage IS 'Fund stage classification: fund1, fund2, fund3, fund4, venture_studio';
COMMENT ON COLUMN investor_matches.factors_json IS 'Detailed factor scores with weights and rationale';
COMMENT ON COLUMN startups.product_readiness IS 'Product stage: idea, mvp, revenue, scaling';

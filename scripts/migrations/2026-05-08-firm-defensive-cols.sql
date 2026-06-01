-- Defensive: make sure investment_firms has the columns the data
-- importers + admin tools expect.  All ADD COLUMN IF NOT EXISTS, so
-- this is safe to re-run on any Anker DB.
--
-- Why: older Anker installs were created from scripts/create-lp-tables.sql
-- which was the FUND-side schema and didn't include columns like
-- founded_year, stages, geographic_focus, check_size_min/max,
-- check_size_range, firm_classification, source.  The matchmaking
-- engine + admin tooling all reference these.

ALTER TABLE investment_firms
  ADD COLUMN IF NOT EXISTS founded_year       INTEGER,
  ADD COLUMN IF NOT EXISTS firm_classification TEXT,
  ADD COLUMN IF NOT EXISTS hq_location         TEXT,
  ADD COLUMN IF NOT EXISTS location            TEXT,
  ADD COLUMN IF NOT EXISTS check_size_min      INTEGER,
  ADD COLUMN IF NOT EXISTS check_size_max      INTEGER,
  ADD COLUMN IF NOT EXISTS check_size_range    TEXT,
  ADD COLUMN IF NOT EXISTS stages              JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS geographic_focus    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS aum                 TEXT,
  ADD COLUMN IF NOT EXISTS typical_check_size  TEXT,
  ADD COLUMN IF NOT EXISTS source              TEXT,
  ADD COLUMN IF NOT EXISTS firm_type           TEXT,
  ADD COLUMN IF NOT EXISTS portfolio_count     INTEGER,
  ADD COLUMN IF NOT EXISTS investment_count    INTEGER;

-- Same defensive pass for investors — older schemas may lack these.
ALTER TABLE investors
  ADD COLUMN IF NOT EXISTS person_linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS sectors             JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS stages              JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS investor_type       TEXT,
  ADD COLUMN IF NOT EXISTS typical_check_size  TEXT,
  ADD COLUMN IF NOT EXISTS typical_investment  TEXT,
  ADD COLUMN IF NOT EXISTS source              TEXT,
  ADD COLUMN IF NOT EXISTS is_active           BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS status              TEXT;

CREATE INDEX IF NOT EXISTS investment_firms_source_idx
  ON investment_firms (source) WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS investors_source_idx
  ON investors (source) WHERE source IS NOT NULL;

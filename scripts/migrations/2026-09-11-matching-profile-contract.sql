-- Additive contract repair. Apply after the workspace and matching-v2 migrations.
-- LP Matchmaking System Tables
-- Run this migration to create the tables needed for LP (Limited Partner) matching

-- ─── Fund Profiles ───────────────────────────────────────────────────────────
-- Stores the GP's fund thesis — the input to LP matchmaking
CREATE TABLE IF NOT EXISTS fund_profiles (
  id TEXT PRIMARY KEY,
  
  -- Fund basics
  name TEXT NOT NULL,
  target_raise INTEGER,
  hard_cap INTEGER,
  minimum_commitment INTEGER,
  fund_life INTEGER,
  
  -- Structure & economics
  management_fee REAL,
  carry REAL,
  gp_commitment REAL,
  structure TEXT,
  legal_structure TEXT,
  waterfall_type TEXT,
  
  -- Investment strategy
  investment_stage TEXT,
  avg_check_size INTEGER,
  target_companies INTEGER,
  investment_period INTEGER,
  
  -- Sectors & geography (JSONB arrays)
  sectors JSONB DEFAULT '[]'::jsonb,
  geographic_focus JSONB DEFAULT '[]'::jsonb,
  headquarters_location TEXT,
  
  -- Target LP types
  target_lp_types JSONB DEFAULT '["family office", "fund of funds", "sovereign wealth fund", "institutional investor", "endowment", "pension"]'::jsonb,
  
  -- Thesis content
  thesis_description TEXT,
  thesis_keywords JSONB DEFAULT '[]'::jsonb,
  value_proposition TEXT,
  
  -- GP track record
  gp_name TEXT,
  gp_track_record JSONB DEFAULT '[]'::jsonb,
  
  -- Portfolio
  portfolio_companies JSONB DEFAULT '[]'::jsonb,
  
  -- Partners
  university_partners JSONB DEFAULT '[]'::jsonb,
  corporate_partners JSONB DEFAULT '[]'::jsonb,
  placement_agent TEXT,
  
  -- Return projections
  return_scenarios JSONB DEFAULT '[]'::jsonb,
  
  -- Timeline
  first_close_date TIMESTAMP,
  final_close_date TIMESTAMP,
  
  -- Custom scoring weights
  scoring_weights JSONB,
  
  -- Metadata
  user_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);


ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS target_raise NUMERIC;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS hard_cap NUMERIC;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS minimum_commitment NUMERIC;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS fund_life INTEGER;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS management_fee REAL;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS carry REAL;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS gp_commitment REAL;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS investment_stage TEXT;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS avg_check_size NUMERIC;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS target_companies INTEGER;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS investment_period INTEGER;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS sectors JSONB DEFAULT '[]'::jsonb;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS primary_sectors JSONB DEFAULT '[]'::jsonb;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS geographic_focus JSONB DEFAULT '[]'::jsonb;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS headquarters_location TEXT;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS target_lp_types JSONB DEFAULT '[]'::jsonb;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS thesis_description TEXT;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS thesis_keywords JSONB DEFAULT '[]'::jsonb;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS value_proposition TEXT;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS gp_name TEXT;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS portfolio_companies JSONB DEFAULT '[]'::jsonb;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS fund_number INTEGER;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS average_ticket NUMERIC;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS fund_i_prior_lp_firm_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS fund_i_prior_contact_emails JSONB DEFAULT '[]'::jsonb;
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE fund_profiles ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES organizations(id);
ALTER TABLE fund_profiles ALTER COLUMN target_raise TYPE NUMERIC;
ALTER TABLE fund_profiles ALTER COLUMN hard_cap TYPE NUMERIC;
ALTER TABLE fund_profiles ALTER COLUMN minimum_commitment TYPE NUMERIC;
ALTER TABLE fund_profiles ALTER COLUMN avg_check_size TYPE NUMERIC;
UPDATE fund_profiles f SET
 name = COALESCE(NULLIF(f.name, ''), to_jsonb(f)->>'fund_name'),
 target_raise = COALESCE(f.target_raise, NULLIF(to_jsonb(f)->>'target_fund_size', '')::numeric),
 sectors = CASE WHEN f.sectors IS NULL OR f.sectors = '[]'::jsonb THEN COALESCE(to_jsonb(f)->'target_sectors', '[]'::jsonb) ELSE f.sectors END,
 geographic_focus = CASE WHEN f.geographic_focus IS NULL OR f.geographic_focus = '[]'::jsonb THEN COALESCE(to_jsonb(f)->'target_geographies', '[]'::jsonb) ELSE f.geographic_focus END;
-- Only attribute legacy records when a single fund workspace is unambiguous.
UPDATE fund_profiles f SET org_id = scoped.org_id FROM (
 SELECT m.user_id, min(m.org_id) AS org_id FROM memberships m JOIN organizations o ON o.id=m.org_id
 WHERE m.persona='vc' AND o.kind='fund' GROUP BY m.user_id HAVING count(*)=1
) scoped WHERE f.org_id IS NULL AND f.user_id=scoped.user_id;
CREATE INDEX IF NOT EXISTS fund_profiles_workspace_user_idx ON fund_profiles(org_id,user_id);
-- Keep legacy NOT NULL fund_name columns satisfied without requiring their presence.
CREATE OR REPLACE FUNCTION sync_matching_fund_legacy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW := jsonb_populate_record(NEW, jsonb_build_object('fund_name', NEW.name,
 'target_fund_size', NEW.target_raise, 'target_sectors', NEW.sectors, 'target_geographies', NEW.geographic_focus));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_matching_fund_legacy ON fund_profiles;
CREATE TRIGGER sync_matching_fund_legacy BEFORE INSERT OR UPDATE ON fund_profiles FOR EACH ROW EXECUTE FUNCTION sync_matching_fund_legacy();
CREATE TABLE IF NOT EXISTS founder_match_sessions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, org_id TEXT NOT NULL REFERENCES organizations(id),
 startup JSONB NOT NULL, result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX IF NOT EXISTS founder_match_sessions_owner_idx ON founder_match_sessions(org_id,user_id,expires_at);

ALTER TABLE lp_match_sessions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running','completed','failed'));

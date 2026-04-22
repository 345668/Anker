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

-- ─── LP Match Sessions ───────────────────────────────────────────────────────
-- Tracks each LP matching run
CREATE TABLE IF NOT EXISTS lp_match_sessions (
  id TEXT PRIMARY KEY,
  fund_profile_id TEXT NOT NULL,
  fund_name TEXT,
  
  -- Results summary
  total_firms_scored INTEGER DEFAULT 0,
  total_contacts_scored INTEGER DEFAULT 0,
  qualified_firms INTEGER DEFAULT 0,
  qualified_contacts INTEGER DEFAULT 0,
  contacts_with_email INTEGER DEFAULT 0,
  anchor_candidates INTEGER DEFAULT 0,
  
  -- Tier breakdown
  tier_counts JSONB,
  
  -- Scoring config
  weights JSONB,
  min_score INTEGER DEFAULT 20,
  
  -- Performance
  duration_ms INTEGER,
  
  -- Metadata
  user_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─── LP Firm Matches ─────────────────────────────────────────────────────────
-- Individual scored LP firms from a session
CREATE TABLE IF NOT EXISTS lp_firm_matches (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  fund_profile_id TEXT NOT NULL,
  
  -- Firm reference
  firm_id TEXT,
  firm_name TEXT,
  firm_type TEXT,
  firm_location TEXT,
  firm_aum TEXT,
  firm_sectors TEXT,
  firm_website TEXT,
  firm_linkedin TEXT,
  
  -- Scoring
  score INTEGER NOT NULL,
  tier TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  reasons JSONB DEFAULT '[]'::jsonb,
  
  -- Factor breakdown
  factor_lp_type INTEGER DEFAULT 0,
  factor_aum INTEGER DEFAULT 0,
  factor_sector INTEGER DEFAULT 0,
  factor_geo INTEGER DEFAULT 0,
  factor_thesis_signals INTEGER DEFAULT 0,
  
  -- Pipeline tracking
  status TEXT DEFAULT 'identified',
  commitment_amount INTEGER,
  meeting_date TIMESTAMP,
  assigned_to TEXT,
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ─── LP Contact Matches ──────────────────────────────────────────────────────
-- Individual scored LP contacts from a session
CREATE TABLE IF NOT EXISTS lp_contact_matches (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  fund_profile_id TEXT NOT NULL,
  
  -- Contact reference
  investor_id TEXT,
  contact_name TEXT,
  contact_title TEXT,
  contact_type TEXT,
  contact_location TEXT,
  contact_email TEXT,
  contact_linkedin TEXT,
  contact_sectors TEXT,
  
  -- Scoring
  score INTEGER NOT NULL,
  tier TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  reasons JSONB DEFAULT '[]'::jsonb,
  
  -- Factor breakdown
  factor_lp_type INTEGER DEFAULT 0,
  factor_aum INTEGER DEFAULT 0,
  factor_sector INTEGER DEFAULT 0,
  factor_geo INTEGER DEFAULT 0,
  factor_thesis_signals INTEGER DEFAULT 0,
  factor_contact_quality INTEGER DEFAULT 0,
  
  -- Pipeline tracking
  status TEXT DEFAULT 'identified',
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ─── LP Pipeline Events ──────────────────────────────────────────────────────
-- Tracks status changes in the LP funnel
CREATE TABLE IF NOT EXISTS lp_pipeline_events (
  id TEXT PRIMARY KEY,
  fund_profile_id TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'firm' or 'contact'
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  
  from_status TEXT,
  to_status TEXT NOT NULL,
  commitment_amount INTEGER,
  notes TEXT,
  
  user_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─── Indexes for Performance ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fund_profiles_user_id ON fund_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_fund_profiles_is_active ON fund_profiles(is_active);

CREATE INDEX IF NOT EXISTS idx_lp_match_sessions_fund_profile_id ON lp_match_sessions(fund_profile_id);
CREATE INDEX IF NOT EXISTS idx_lp_match_sessions_created_at ON lp_match_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lp_firm_matches_session_id ON lp_firm_matches(session_id);
CREATE INDEX IF NOT EXISTS idx_lp_firm_matches_fund_profile_id ON lp_firm_matches(fund_profile_id);
CREATE INDEX IF NOT EXISTS idx_lp_firm_matches_score ON lp_firm_matches(score DESC);
CREATE INDEX IF NOT EXISTS idx_lp_firm_matches_status ON lp_firm_matches(status);

CREATE INDEX IF NOT EXISTS idx_lp_contact_matches_session_id ON lp_contact_matches(session_id);
CREATE INDEX IF NOT EXISTS idx_lp_contact_matches_fund_profile_id ON lp_contact_matches(fund_profile_id);
CREATE INDEX IF NOT EXISTS idx_lp_contact_matches_score ON lp_contact_matches(score DESC);

CREATE INDEX IF NOT EXISTS idx_lp_pipeline_events_fund_profile_id ON lp_pipeline_events(fund_profile_id);
CREATE INDEX IF NOT EXISTS idx_lp_pipeline_events_entity ON lp_pipeline_events(entity_type, entity_id);

-- Platform tables used by the main /dashboard page (deals, contacts, etc.)
-- These are app-internal tables that the Anker product uses; they exist in
-- the Neon prod schema but were never in our local migrations. Added here
-- so the dashboard renders against either PGlite or Docker Postgres.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  name TEXT,
  firm_id TEXT,
  firm_name TEXT,
  stage TEXT,
  amount NUMERIC,
  valuation NUMERIC,
  next_step TEXT,
  next_step_date TEXT,
  notes TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  investor_id TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  title TEXT,
  notes TEXT,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS startups (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  name TEXT,
  description TEXT,
  industry TEXT,
  stage TEXT,
  location TEXT,
  website TEXT,
  team_size INT,
  funding_target NUMERIC,
  funding_raised NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investor_matches (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  startup_id TEXT,
  firm_id TEXT,
  investor_id TEXT,
  match_score NUMERIC,
  match_factors JSONB,
  status TEXT DEFAULT 'identified',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outreaches (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  contact_id TEXT,
  deal_id TEXT,
  stage TEXT,
  channel TEXT,
  subject TEXT,
  body TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  type TEXT,
  title TEXT,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pitch_decks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  startup_id TEXT,
  title TEXT,
  file_url TEXT,
  file_size BIGINT,
  slides_count INT,
  ai_analysis JSONB,
  ai_score NUMERIC,
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_room_files (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  startup_id TEXT,
  name TEXT,
  file_url TEXT,
  file_type TEXT,
  file_size BIGINT,
  folder TEXT,
  is_confidential BOOLEAN DEFAULT false,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  type TEXT,
  title TEXT,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deals_user_idx ON deals (user_id);
CREATE INDEX IF NOT EXISTS contacts_user_idx ON contacts (user_id);
CREATE INDEX IF NOT EXISTS activities_user_idx ON activities (user_id, created_at DESC);

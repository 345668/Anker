-- Founder matching v3, email verification, Discover v2.
-- docs/architecture/11–14. Additive only: new tables and columns, and two
-- CHECK constraints widened (never narrowed).

-- ─── Founder profiles, runs and results (doc 14 §6) ─────────────────────────
CREATE TABLE IF NOT EXISTS startup_profiles (
  id          text PRIMARY KEY,
  org_id      text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version     integer NOT NULL,
  fields      jsonb NOT NULL,
  provenance  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, version)
);

CREATE TABLE IF NOT EXISTS founder_match_runs (
  id                  text PRIMARY KEY,
  org_id              text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             text NOT NULL,
  profile_version_id  text REFERENCES startup_profiles(id) ON DELETE SET NULL,
  engine_version      text NOT NULL,
  options             jsonb NOT NULL DEFAULT '{}'::jsonb,
  startup             jsonb NOT NULL,
  totals              jsonb NOT NULL,
  tier_counts         jsonb,
  segment_counts      jsonb,
  funnel              jsonb,
  semantic            jsonb,
  exclusions          jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL DEFAULT now() + interval '180 days'
);
CREATE INDEX IF NOT EXISTS founder_match_runs_org_idx ON founder_match_runs (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS founder_match_results (
  run_id        text NOT NULL REFERENCES founder_match_runs(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('group', 'independent')),
  rank          integer NOT NULL,
  entity_id     text NOT NULL,
  firm_id       text,
  score         real NOT NULL,
  tier          text NOT NULL,
  name          text NOT NULL,
  email_status  text,
  payload       jsonb NOT NULL,
  PRIMARY KEY (run_id, kind, rank)
);
CREATE INDEX IF NOT EXISTS founder_match_results_entity_idx ON founder_match_results (run_id, entity_id);

CREATE TABLE IF NOT EXISTS founder_match_exclusions (
  org_id      text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_key  text NOT NULL,          -- firm:<id> | contact:<id>
  reason      text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, entity_key)
);

-- Founder runs record what founders were shown (doc 10 L11).
ALTER TABLE match_outcome_events DROP CONSTRAINT IF EXISTS match_outcome_events_source_check;
ALTER TABLE match_outcome_events ADD CONSTRAINT match_outcome_events_source_check
  CHECK (source IN ('crm_entry', 'lp_firm_match', 'lp_contact_match', 'outreach', 'founder_match'));

-- Saves from Discover are labelled as such (doc 10 DS8).
ALTER TABLE crm_entries DROP CONSTRAINT IF EXISTS crm_entries_source_check;
ALTER TABLE crm_entries ADD CONSTRAINT crm_entries_source_check
  CHECK (source IN ('lp_matching', 'founder_matching', 'manual', 'discover'));

-- ─── Email verification (doc 13) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_verifications (
  email       text PRIMARY KEY,
  domain      text NOT NULL,
  status      text NOT NULL CHECK (status IN ('valid', 'risky', 'unknown', 'invalid')),
  reason      text,
  provider    text NOT NULL,
  mx_found    boolean,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  raw         jsonb
);
CREATE INDEX IF NOT EXISTS email_verifications_expires_idx ON email_verifications (expires_at);
CREATE INDEX IF NOT EXISTS email_verifications_provider_day_idx ON email_verifications (provider, checked_at);

-- ─── Normalised directory (doc 14 §9) ───────────────────────────────────────
ALTER TABLE investment_firms
  ADD COLUMN IF NOT EXISTS norm_country  text,
  ADD COLUMN IF NOT EXISTS norm_region   text,
  ADD COLUMN IF NOT EXISTS norm_sectors  text[],
  ADD COLUMN IF NOT EXISTS norm_stages   text[],
  ADD COLUMN IF NOT EXISTS norm_class    text,
  ADD COLUMN IF NOT EXISTS check_min     numeric,
  ADD COLUMN IF NOT EXISTS check_max     numeric,
  ADD COLUMN IF NOT EXISTS normalized_at timestamptz;
ALTER TABLE investors
  ADD COLUMN IF NOT EXISTS norm_country  text,
  ADD COLUMN IF NOT EXISTS norm_region   text,
  ADD COLUMN IF NOT EXISTS norm_sectors  text[],
  ADD COLUMN IF NOT EXISTS norm_stages   text[],
  ADD COLUMN IF NOT EXISTS norm_class    text,
  ADD COLUMN IF NOT EXISTS check_min     numeric,
  ADD COLUMN IF NOT EXISTS check_max     numeric,
  ADD COLUMN IF NOT EXISTS normalized_at timestamptz;
CREATE INDEX IF NOT EXISTS investment_firms_norm_sectors_idx ON investment_firms USING gin (norm_sectors);
CREATE INDEX IF NOT EXISTS investment_firms_norm_stages_idx  ON investment_firms USING gin (norm_stages);
CREATE INDEX IF NOT EXISTS investment_firms_norm_class_idx   ON investment_firms (norm_class, norm_country);
CREATE INDEX IF NOT EXISTS investors_norm_sectors_idx        ON investors USING gin (norm_sectors);
CREATE INDEX IF NOT EXISTS investors_norm_stages_idx         ON investors USING gin (norm_stages);
CREATE INDEX IF NOT EXISTS investors_norm_class_idx          ON investors (norm_class, norm_country);
CREATE INDEX IF NOT EXISTS investors_firm_id_idx             ON investors (firm_id);

CREATE TABLE IF NOT EXISTS discovery_facets (
  lens          text NOT NULL,
  kind          text NOT NULL,
  facet         text NOT NULL,
  value         text NOT NULL,
  label         text NOT NULL,
  n             integer NOT NULL,
  refreshed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lens, kind, facet, value)
);

CREATE TABLE IF NOT EXISTS discovery_saved_searches (
  id          text PRIMARY KEY,
  org_id      text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  lens        text NOT NULL,
  name        text NOT NULL,
  filters     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discovery_saved_searches_owner_idx ON discovery_saved_searches (org_id, user_id);

-- Export cap (doc 12 §5): one row per export, counted per workspace per day.
CREATE TABLE IF NOT EXISTS discovery_exports (
  id          text PRIMARY KEY,
  org_id      text NOT NULL,
  user_id     text NOT NULL,
  lens        text NOT NULL,
  rows        integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discovery_exports_org_day_idx ON discovery_exports (org_id, created_at);

-- Funds opt in to the LP Discover listing (doc 12 §3.3).
ALTER TABLE funds ADD COLUMN IF NOT EXISTS listed_for_lps boolean NOT NULL DEFAULT false;

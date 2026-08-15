-- KYC / AML: real screening cases, sanctions/PEP hits, and document collection.
-- Replaces the pseudo-status demo. Additive and idempotent.
-- No semicolons inside comments (the migration runner splits on them).

-- One screening case per investor (optionally linked to a fund LP).
CREATE TABLE IF NOT EXISTS kyc_cases (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_by   text,
  fund_id      text,
  fund_lp_id   text REFERENCES fund_lps(id) ON DELETE SET NULL,
  subject_name text NOT NULL,
  subject_type text NOT NULL DEFAULT 'individual' CHECK (subject_type IN ('individual', 'entity')),
  status       text NOT NULL DEFAULT 'not_started'
               CHECK (status IN ('not_started', 'in_progress', 'cleared', 'escalated', 'rejected')),
  risk_level   text NOT NULL DEFAULT 'unknown' CHECK (risk_level IN ('unknown', 'low', 'medium', 'high')),
  screened_at  timestamptz,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_cases_owner_idx ON kyc_cases (created_by, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS kyc_cases_lp_uniq ON kyc_cases (fund_lp_id) WHERE fund_lp_id IS NOT NULL;

-- Screening hits produced by a run against the watchlist.
CREATE TABLE IF NOT EXISTS kyc_screening_hits (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  case_id    text NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,
  list       text NOT NULL CHECK (list IN ('sanctions', 'pep', 'adverse_media')),
  match_name text NOT NULL,
  program    text,
  country    text,
  score      numeric(4,3) NOT NULL DEFAULT 0,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cleared', 'confirmed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_hits_case_idx ON kyc_screening_hits (case_id);

-- Collected onboarding documents.
CREATE TABLE IF NOT EXISTS kyc_documents (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  case_id      text NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,
  doc_type     text NOT NULL,
  label        text,
  status       text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'received', 'verified', 'rejected')),
  file_url     text,
  requested_at timestamptz DEFAULT now(),
  received_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_docs_case_idx ON kyc_documents (case_id);

-- Watchlist to screen against. Seeded with SYNTHETIC placeholder entries — in
-- production this table is replaced by a real feed (OpenSanctions / OFAC SDN /
-- a screening provider). Names below are fictional test data only.
CREATE TABLE IF NOT EXISTS kyc_watchlist (
  id      text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name    text NOT NULL,
  list    text NOT NULL CHECK (list IN ('sanctions', 'pep', 'adverse_media')),
  program text,
  country text
);
CREATE UNIQUE INDEX IF NOT EXISTS kyc_watchlist_uniq ON kyc_watchlist (name, list);

INSERT INTO kyc_watchlist (name, list, program, country) VALUES
  ('Blocked Entity Bravo',        'sanctions',     'OFAC SDN (sample)',        'XX'),
  ('Sanctioned Person Alpha',     'sanctions',     'EU Consolidated (sample)', 'XX'),
  ('Global Shell Holdings Sample','sanctions',     'OFAC SDN (sample)',        'XX'),
  ('Politically Exposed Delta',   'pep',           'PEP register (sample)',    'XX'),
  ('Minister Sample Echo',        'pep',           'PEP register (sample)',    'XX'),
  ('Adverse Media Foxtrot',       'adverse_media', 'Adverse media (sample)',   'XX')
ON CONFLICT (name, list) DO NOTHING;

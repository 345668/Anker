-- Early-access request list (waitlist) — captures people who want access to the
-- Anker platform before/around invite-only signup. Fed by the public /early-access
-- form. Owner Console can triage these into invites.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS early_access_requests (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  persona         TEXT,              -- founder | investor | lp | other
  company         TEXT,              -- company / fund name
  role            TEXT,              -- job title / role
  website         TEXT,              -- website or LinkedIn URL
  stage           TEXT,              -- founder round stage / fund stage (optional context)
  use_case        TEXT,              -- what they want to use Anker for
  heard_from      TEXT,              -- how they heard about us (optional)
  referral_source TEXT,              -- utm / entry point (e.g. linkedin_page_button)
  status          TEXT DEFAULT 'pending',   -- pending | invited | rejected | contacted
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_early_access_requests_email      ON early_access_requests (email);
CREATE INDEX IF NOT EXISTS idx_early_access_requests_status     ON early_access_requests (status);
CREATE INDEX IF NOT EXISTS idx_early_access_requests_created_at ON early_access_requests (created_at DESC);

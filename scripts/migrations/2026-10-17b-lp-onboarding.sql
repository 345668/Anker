-- The LP leg, slice L1 (docs/architecture/60): an LP's contact address, the onboarding steps, the emailed code that opens the portal, the portal session,
-- what the LP confirms about themselves, and the terms they accepted. Additive. Existing LPs start as 'not_invited'.
ALTER TABLE fund_lps ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE fund_lps ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE fund_lps ADD COLUMN IF NOT EXISTS onboarding_state text NOT NULL DEFAULT 'not_invited';
ALTER TABLE fund_lps DROP CONSTRAINT IF EXISTS fund_lps_onboarding_state_check;
ALTER TABLE fund_lps ADD CONSTRAINT fund_lps_onboarding_state_check CHECK (onboarding_state IN ('not_invited', 'invited', 'opened', 'details_confirmed', 'terms_accepted', 'verification_submitted', 'subscription_returned', 'countersigned'));
ALTER TABLE fund_lps ADD COLUMN IF NOT EXISTS invited_at timestamptz;
ALTER TABLE fund_lps ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE fund_lps ADD COLUMN IF NOT EXISTS details_confirmed_at timestamptz;
ALTER TABLE fund_lps ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

-- A six-digit code sent to the LP's own address before the portal shows anything about them. Only a hash is kept.
CREATE TABLE IF NOT EXISTS lp_portal_codes (
  id bigserial PRIMARY KEY,
  token_id uuid NOT NULL,
  lp_id text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lp_portal_codes_token_idx ON lp_portal_codes (token_id, created_at DESC);

-- A browser that entered the right code. Twelve hours; only a hash of the cookie value is kept.
CREATE TABLE IF NOT EXISTS lp_portal_sessions (
  id bigserial PRIMARY KEY,
  token_id uuid NOT NULL,
  lp_id text NOT NULL,
  session_hash text NOT NULL UNIQUE,
  ip text,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lp_portal_sessions_lp_idx ON lp_portal_sessions (lp_id, created_at DESC);

-- What the LP says about themselves. Kept beside the fund's own record, never written over it: the fund reviews the differences.
CREATE TABLE IF NOT EXISTS lp_onboarding_details (
  lp_id text PRIMARY KEY,
  legal_name text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('individual', 'company', 'trust', 'fund', 'family_office', 'other')),
  address text,
  country text,
  tax_residence text,
  tax_id_enc text,
  signatory_name text,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text
);

CREATE TABLE IF NOT EXISTS lp_terms_acceptances (
  id bigserial PRIMARY KEY,
  lp_id text NOT NULL,
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent_hash text
);
CREATE INDEX IF NOT EXISTS lp_terms_lp_idx ON lp_terms_acceptances (lp_id, accepted_at DESC);

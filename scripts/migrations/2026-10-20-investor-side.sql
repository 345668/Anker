-- The investor's side (docs/architecture/64, doc 61 P1 and P2, doc 63 M7). Everything here is closed until a platform flag and a fund's listing switch are turned on.

-- ── Investor-owned: belongs to the investor, not to any workspace (outside tenant erasure and export) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS investor_profiles (
  user_id text PRIMARY KEY,
  display_name text NOT NULL,
  country text,
  languages jsonb NOT NULL DEFAULT '[]'::jsonb,
  contact_pref text,
  about text,
  terms_version text NOT NULL,
  terms_accepted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  erased_at timestamptz
);

CREATE TABLE IF NOT EXISTS investor_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES investor_profiles(user_id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('individual', 'company', 'trust', 'fund', 'family_office')),
  country text,
  tax_residence text,
  -- Self-declared and labelled as such everywhere it is shown.
  category text CHECK (category IN ('professional', 'semi_professional', 'other', 'unsure')),
  interests jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Opt-in discoverability is a later slice; the column exists so the rule "never on by default" is in the schema.
  discoverable boolean NOT NULL DEFAULT false CHECK (discoverable = false),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX IF NOT EXISTS investor_entities_user_idx ON investor_entities (user_id) WHERE archived_at IS NULL;

-- A sign-up that has not yet proved its address. No account exists until the code is verified.
CREATE TABLE IF NOT EXISTS investor_signup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  ip text,
  terms_version text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS investor_signup_codes_email_idx ON investor_signup_codes (lower(email), created_at DESC);

-- ── Fund-owned: what a fund shows investors, its rules, and the requests made to it ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fund_listings (
  fund_id text PRIMARY KEY REFERENCES funds(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  eligibility jsonb NOT NULL,
  version int NOT NULL DEFAULT 1,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  refreshed_by text
);

CREATE TABLE IF NOT EXISTS fund_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id text NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES investor_entities(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  stage text NOT NULL DEFAULT 'interested' CHECK (stage IN ('interested', 'in_talks', 'invited_to_onboard', 'onboarding', 'active', 'on_hold', 'declined', 'withdrawn')),
  initiated_by text NOT NULL DEFAULT 'investor' CHECK (initiated_by IN ('investor', 'fund')),
  indicative_min numeric,
  indicative_max numeric,
  timing text,
  note text,
  -- A copy of what the investor chose to share with this fund, with the time (docs/architecture/61 section 10).
  shared jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility_check jsonb,
  fit jsonb,
  decided_by text,
  decided_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One open relationship per entity per fund.
CREATE UNIQUE INDEX IF NOT EXISTS fund_relationships_open_uq ON fund_relationships (entity_id, fund_id) WHERE stage IN ('interested', 'in_talks', 'invited_to_onboard', 'onboarding', 'on_hold');
CREATE INDEX IF NOT EXISTS fund_relationships_fund_idx ON fund_relationships (fund_id, stage, created_at DESC);
CREATE INDEX IF NOT EXISTS fund_relationships_user_idx ON fund_relationships (user_id, created_at DESC);

INSERT INTO platform_flags (key, enabled, rollout_pct, description) VALUES ('investor_signup', false, 100, 'Public investor sign-up (docs/architecture/64). Off until counsel has read the listing and eligibility wording.') ON CONFLICT (key) DO NOTHING;

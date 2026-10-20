-- Claiming a record a fund added (docs/architecture/67). Additive. Investor-owned, short-lived.
CREATE TABLE IF NOT EXISTS investor_claim_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  lp_id text NOT NULL,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS investor_claim_codes_user_idx ON investor_claim_codes (user_id, created_at DESC);

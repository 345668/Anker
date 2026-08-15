-- SPV LP portal: magic-link tokens so an SPV subscriber can view their own
-- position without a platform account. Mirrors lp_portal_tokens. The plaintext
-- token is never stored (only its sha-256 hash). Additive and idempotent.
-- No semicolons inside comments (the migration runner splits on them).

CREATE TABLE IF NOT EXISTS spv_portal_tokens (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subscription_id text NOT NULL REFERENCES spv_subscriptions(id) ON DELETE CASCADE,
  spv_id          text NOT NULL REFERENCES spvs(id) ON DELETE CASCADE,
  token_hash      text NOT NULL UNIQUE,
  prefix          text NOT NULL,
  label           text,
  expires_at      timestamptz,
  revoked         boolean NOT NULL DEFAULT false,
  last_seen_at    timestamptz,
  view_count      int NOT NULL DEFAULT 0,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spv_portal_tokens_sub_idx ON spv_portal_tokens (subscription_id, created_at DESC);

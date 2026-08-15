-- SPV lifecycle: the per-SPV investor subscription book. Turns the flat SPV
-- record into a real vehicle with a funnel (invited to funded) whose committed
-- total rolls up into spvs.committed_amount. Additive and idempotent.
-- No semicolons inside comments (the migration runner splits on them).

CREATE TABLE IF NOT EXISTS spv_subscriptions (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  spv_id         text NOT NULL REFERENCES spvs(id) ON DELETE CASCADE,
  investor_name  text NOT NULL,
  investor_email text,
  amount         numeric(14,2) NOT NULL DEFAULT 0,
  -- Progressive subscription funnel plus a terminal declined state.
  status         text NOT NULL DEFAULT 'invited'
                 CHECK (status IN ('invited', 'committed', 'signed', 'funded', 'declined')),
  subscribed_at  date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spv_subscriptions_spv_idx ON spv_subscriptions (spv_id, created_at DESC);

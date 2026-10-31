-- Prepaid AI credit ledger (docs/architecture/58 section 8, M4). Dollars, like the allowance it sits beside. Additive; idempotent. Append-only: a row is never updated or deleted by the app.
--   grant   a positive amount that may expire (a pack, a promotion, a manual grant)
--   debit   a negative amount taken from ONE grant (grant_id) for spend beyond the plan's monthly allowance; `period` is the month it covers (YYYY-MM)
--   expiry  a negative amount that closes what is left of an expired grant (grant_id)
--   adjust  a signed correction by a person, with a reason
-- A grant's remaining balance is its amount plus the debits and expiry that point at it.
CREATE TABLE IF NOT EXISTS ai_credit_ledger (
  id          BIGSERIAL PRIMARY KEY,
  org_id      TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('grant','debit','expiry','adjust')),
  amount_usd  NUMERIC(12,6) NOT NULL,
  grant_id    BIGINT REFERENCES ai_credit_ledger(id),
  source      TEXT,
  ref         TEXT,
  expires_at  TIMESTAMPTZ,
  period      TEXT,
  reason      TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'grant' AND amount_usd > 0) OR (kind IN ('debit','expiry') AND amount_usd < 0 AND grant_id IS NOT NULL) OR kind = 'adjust'),
  CHECK (kind <> 'debit' OR period ~ '^\d{4}-\d{2}$')
);
CREATE INDEX IF NOT EXISTS idx_ai_credit_ledger_org ON ai_credit_ledger (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_credit_ledger_grant ON ai_credit_ledger (grant_id) WHERE grant_id IS NOT NULL;
-- A grant from a payment or a promotion is recorded once, however many times the webhook or the form is submitted.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_credit_grant_ref ON ai_credit_ledger (org_id, source, ref) WHERE kind = 'grant' AND ref IS NOT NULL;
-- One settlement per grant and month can never take more than once for the same slice: the debit's period plus its grant make a natural key only for idempotent retries of the SAME amount.

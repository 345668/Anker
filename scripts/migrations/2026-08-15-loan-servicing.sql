-- Loan servicing: payment ledger + covenants, turning the flat loan record into
-- a serviced facility with an amortization schedule, accrual, and payments.
-- Additive and idempotent. No semicolons inside comments.

ALTER TABLE loans ADD COLUMN IF NOT EXISTS payment_frequency text NOT NULL DEFAULT 'monthly'
  CHECK (payment_frequency IN ('monthly', 'quarterly', 'semiannual', 'annual', 'bullet'));

-- Recorded payments against a loan. principal_portion + interest_portion split
-- the amount; outstanding is recomputed from these.
CREATE TABLE IF NOT EXISTS loan_payments (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  loan_id           text NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  paid_on           date NOT NULL,
  amount            numeric(14,2) NOT NULL DEFAULT 0,
  principal_portion numeric(14,2) NOT NULL DEFAULT 0,
  interest_portion  numeric(14,2) NOT NULL DEFAULT 0,
  kind              text NOT NULL DEFAULT 'scheduled'
                    CHECK (kind IN ('scheduled', 'interest', 'prepayment', 'payoff')),
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loan_payments_loan_idx ON loan_payments (loan_id, paid_on);

-- Loan covenants + their current test status.
CREATE TABLE IF NOT EXISTS loan_covenants (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  loan_id     text NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'financial'
              CHECK (kind IN ('financial', 'reporting', 'affirmative', 'negative')),
  requirement text,
  status      text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'at_risk', 'breached', 'waived')),
  tested_at   date,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loan_covenants_loan_idx ON loan_covenants (loan_id);

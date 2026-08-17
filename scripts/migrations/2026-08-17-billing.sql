-- Stripe billing. One customer + subscription row per org (workspace). Credit
-- ledger tracks metered AI/usage credits granted and consumed.

CREATE TABLE IF NOT EXISTS billing_customers (
  org_id             text PRIMARY KEY,
  stripe_customer_id text UNIQUE,
  email              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  org_id                 text PRIMARY KEY,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id     text,
  status                 text,
  plan                   text,
  price_id               text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Append-only credit ledger. Positive = granted (plan allotment, top-up),
-- negative = consumed (AI-router spend). Balance = SUM(delta).
CREATE TABLE IF NOT EXISTS billing_credit_ledger (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id     text NOT NULL,
  delta      integer NOT NULL,
  reason     text,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_credit_ledger_org_idx ON billing_credit_ledger (org_id, created_at DESC);

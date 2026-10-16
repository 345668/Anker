-- Metering M3 (docs/architecture/58): allowance warnings once per threshold per month, and the provider bill the founder enters monthly for reconciliation. Additive.
CREATE TABLE IF NOT EXISTS usage_warnings (
  org_id text NOT NULL,
  month date NOT NULL,
  threshold integer NOT NULL CHECK (threshold IN (80, 100)),
  used_usd numeric,
  limit_usd numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, month, threshold)
);
CREATE TABLE IF NOT EXISTS provider_bills (
  month date NOT NULL,
  provider text NOT NULL,
  amount_usd numeric NOT NULL CHECK (amount_usd >= 0),
  note text,
  entered_by text,
  entered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (month, provider)
);

-- Real backends for the Carta parity modules (SPVs, Share Plans, 409A, Equity Compliance).

-- SPVs (VC / Fund OS) — scoped by created_by (the GP user).
CREATE TABLE IF NOT EXISTS spvs (
  id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_by       text,
  name             text NOT NULL,
  deal_name        text,
  target_amount    numeric(14,2) NOT NULL DEFAULT 0,
  committed_amount numeric(14,2) NOT NULL DEFAULT 0,
  stage            text NOT NULL DEFAULT 'forming' CHECK (stage IN ('forming','open','closed','wound_down')),
  lead             text,
  close_date       date,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spvs_owner_idx ON spvs (created_by, created_at DESC);

-- Option grants (Founder / Equity Suite) — scoped by company_id.
CREATE TABLE IF NOT EXISTS option_grants (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id    text NOT NULL,
  grantee_name  text NOT NULL,
  grantee_email text,
  options       integer NOT NULL DEFAULT 0,
  strike_price  numeric(12,4),
  grant_date    date,
  vest_months   integer NOT NULL DEFAULT 48,
  cliff_months  integer NOT NULL DEFAULT 12,
  status        text NOT NULL DEFAULT 'granted' CHECK (status IN ('draft','granted','exercised','cancelled')),
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS option_grants_company_idx ON option_grants (company_id, created_at DESC);

-- 409A valuations (Founder / Equity Suite).
CREATE TABLE IF NOT EXISTS valuations_409a (
  id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id         text NOT NULL,
  fair_market_value  numeric(14,2),
  common_price       numeric(12,4),
  method             text NOT NULL DEFAULT 'OPM',
  status             text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','in_progress','completed','board_approved','expired')),
  valued_at          date,
  expires_at         date,
  notes              text,
  created_by         text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS valuations_409a_company_idx ON valuations_409a (company_id, created_at DESC);

-- Equity compliance filings (Founder / Equity Suite).
CREATE TABLE IF NOT EXISTS equity_filings (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id   text NOT NULL,
  title        text NOT NULL,
  filing_type  text,
  due_date     date,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','filed','overdue','na')),
  filed_at     date,
  notes        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS equity_filings_company_idx ON equity_filings (company_id, due_date);

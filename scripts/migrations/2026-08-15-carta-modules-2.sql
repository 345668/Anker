-- Real backends for the last scaffolds: Loan Operations, Contracts, Compensation.

-- Loans (VC / Private Credit) — scoped by created_by.
CREATE TABLE IF NOT EXISTS loans (
  id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_by       text,
  borrower         text NOT NULL,
  principal        numeric(14,2) NOT NULL DEFAULT 0,
  outstanding      numeric(14,2),
  interest_rate    numeric(6,3),
  origination_date date,
  maturity_date    date,
  amortization     text NOT NULL DEFAULT 'bullet' CHECK (amortization IN ('bullet','amortizing','interest_only','revolving')),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','repaid','default','written_off')),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loans_owner_idx ON loans (created_by, created_at DESC);

-- Contracts (VC / Carta Law) — scoped by created_by.
CREATE TABLE IF NOT EXISTS contracts (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_by     text,
  title          text NOT NULL,
  counterparty   text,
  contract_type  text,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','sent','signed','expired')),
  value          numeric(14,2),
  effective_date date,
  expiry_date    date,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contracts_owner_idx ON contracts (created_by, created_at DESC);

-- Compensation bands (Founder) — scoped by company_id.
CREATE TABLE IF NOT EXISTS comp_bands (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id  text NOT NULL,
  created_by  text,
  role        text NOT NULL,
  level       text,
  geography   text,
  base_min    numeric(12,2),
  base_max    numeric(12,2),
  equity_min  numeric(8,4),
  equity_max  numeric(8,4),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comp_bands_company_idx ON comp_bands (company_id, created_at DESC);

-- Financial Report Progress (Carta quarterly-close workflow).
-- One row per fund entity per reporting period; steps live in jsonb.
CREATE TABLE IF NOT EXISTS financial_reports (
  id          text PRIMARY KEY,
  fund_id     text NOT NULL,
  entity_name text,
  period      text NOT NULL,                 -- e.g. "Q1 2025", "Q4-YE 2024"
  status      text NOT NULL DEFAULT 'needs_review'
                CHECK (status IN ('draft','needs_review','done')),
  steps       jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, period, entity_name)
);
CREATE INDEX IF NOT EXISTS financial_reports_fund_idx ON financial_reports(fund_id, period);

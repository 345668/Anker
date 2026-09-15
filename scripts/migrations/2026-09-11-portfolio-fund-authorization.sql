-- Canonical fund ownership for portfolio companies, LP letters and KPI reviews.
-- Run before deploying the matching application change. Never invent a fund or
-- silently assign unmapped records: preflight failures roll back this migration.
DO $migration$
BEGIN
LOCK TABLE funds, portfolio_companies, lp_quarterly_reports, portfolio_kpi_extractions IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (SELECT 1 FROM funds a JOIN funds b ON a.id = b.slug AND a.id <> b.id) THEN
    RAISE EXCEPTION 'Ambiguous fund ID/slug aliases: resolve collisions before migrating portfolio ownership';
  END IF;

UPDATE portfolio_companies p SET fund_id = f.id FROM funds f WHERE p.fund_id = f.slug AND p.fund_id <> f.id;
UPDATE lp_quarterly_reports p SET fund_id = f.id FROM funds f WHERE p.fund_id = f.slug AND p.fund_id <> f.id;
UPDATE portfolio_kpi_extractions p SET fund_id = f.id FROM funds f WHERE p.fund_id = f.slug AND p.fund_id <> f.id;
-- Null scope can only be inferred from an existing linked company.
UPDATE portfolio_kpi_extractions x SET fund_id = c.fund_id FROM portfolio_companies c WHERE x.company_id = c.id AND x.fund_id IS NULL;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT fund_id FROM portfolio_companies UNION ALL
      SELECT fund_id FROM lp_quarterly_reports UNION ALL
      SELECT fund_id FROM portfolio_kpi_extractions
    ) p LEFT JOIN funds f ON f.id = p.fund_id WHERE f.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Unmapped portfolio fund ownership: explicitly map legacy fund_id values (including unlinked KPI extractions) to funds.id and rerun';
  END IF;
  IF EXISTS (SELECT 1 FROM portfolio_kpi_extractions x JOIN portfolio_companies c ON c.id = x.company_id WHERE c.fund_id <> x.fund_id) THEN
    RAISE EXCEPTION 'Cross-fund KPI company link: review and correct company_id before migrating';
  END IF;

ALTER TABLE portfolio_companies ALTER COLUMN fund_id DROP DEFAULT;
ALTER TABLE lp_quarterly_reports ALTER COLUMN fund_id DROP DEFAULT;
ALTER TABLE portfolio_kpi_extractions ALTER COLUMN fund_id SET NOT NULL;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portfolio_companies_fund_fk' AND conrelid = 'portfolio_companies'::regclass) THEN
    ALTER TABLE portfolio_companies ADD CONSTRAINT portfolio_companies_fund_fk FOREIGN KEY (fund_id) REFERENCES funds(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lp_quarterly_reports_fund_fk' AND conrelid = 'lp_quarterly_reports'::regclass) THEN
    ALTER TABLE lp_quarterly_reports ADD CONSTRAINT lp_quarterly_reports_fund_fk FOREIGN KEY (fund_id) REFERENCES funds(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portfolio_kpi_extractions_fund_fk' AND conrelid = 'portfolio_kpi_extractions'::regclass) THEN
    ALTER TABLE portfolio_kpi_extractions ADD CONSTRAINT portfolio_kpi_extractions_fund_fk FOREIGN KEY (fund_id) REFERENCES funds(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portfolio_companies_fund_id_key' AND conrelid = 'portfolio_companies'::regclass) THEN
    ALTER TABLE portfolio_companies ADD CONSTRAINT portfolio_companies_fund_id_key UNIQUE (fund_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portfolio_kpi_extractions_company_fund_fk' AND conrelid = 'portfolio_kpi_extractions'::regclass) THEN
    ALTER TABLE portfolio_kpi_extractions ADD CONSTRAINT portfolio_kpi_extractions_company_fund_fk FOREIGN KEY (fund_id, company_id) REFERENCES portfolio_companies(fund_id, id);
  END IF;

-- The original tracker CHECK omitted the ingestion source used by approvals.
ALTER TABLE portfolio_kpis_monthly DROP CONSTRAINT IF EXISTS portfolio_kpis_monthly_source_check;
ALTER TABLE portfolio_kpis_monthly ADD CONSTRAINT portfolio_kpis_monthly_source_check CHECK (source IN ('manual', 'founder_form', 'import_xlsx', 'api', 'email_update'));
CREATE INDEX IF NOT EXISTS portfolio_kpi_extractions_fund_status_idx ON portfolio_kpi_extractions (fund_id, status, created_at DESC);
END $migration$;

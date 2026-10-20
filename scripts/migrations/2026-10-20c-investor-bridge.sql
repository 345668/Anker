-- The bridge from an investor relationship to the fund's investor record (docs/architecture/66). Additive.
ALTER TABLE fund_relationships ADD COLUMN IF NOT EXISTS fund_lp_id text REFERENCES fund_lps(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fund_relationships_fund_lp_uq ON fund_relationships (fund_lp_id) WHERE fund_lp_id IS NOT NULL;

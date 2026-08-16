-- 409A OPM engine: inputs + computed outputs on the valuation record. The
-- Option Pricing Method backsolves total equity value from the most recent
-- preferred price, then allocates to common (with a DLOM). Additive/idempotent.

ALTER TABLE valuations_409a ADD COLUMN IF NOT EXISTS common_shares      numeric(18,4);
ALTER TABLE valuations_409a ADD COLUMN IF NOT EXISTS preferred_shares   numeric(18,4);
ALTER TABLE valuations_409a ADD COLUMN IF NOT EXISTS liquidation_pref   numeric(18,2);
ALTER TABLE valuations_409a ADD COLUMN IF NOT EXISTS recent_price       numeric(16,6);
ALTER TABLE valuations_409a ADD COLUMN IF NOT EXISTS volatility         numeric(7,4);
ALTER TABLE valuations_409a ADD COLUMN IF NOT EXISTS risk_free_rate     numeric(7,4);
ALTER TABLE valuations_409a ADD COLUMN IF NOT EXISTS years_to_liquidity numeric(7,2);
ALTER TABLE valuations_409a ADD COLUMN IF NOT EXISTS dlom               numeric(7,4);
ALTER TABLE valuations_409a ADD COLUMN IF NOT EXISTS equity_value       numeric(18,2);

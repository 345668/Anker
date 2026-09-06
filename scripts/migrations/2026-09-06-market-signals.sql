-- Market Signals (Metal gap #3) — a live feed of investor activity, so founders
-- can time outreach to who is actively deploying in their space. Signals are
-- global (source-derived from the investor DB today; external sources later),
-- filtered to the founder's sector/stage at read time.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS market_signals (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  investor_id   TEXT,                 -- link to investors (nullable)
  investor_name TEXT,
  firm_name     TEXT,
  signal_type   TEXT,                 -- active | recent_check | new_fund | thesis | hiring
  title         TEXT NOT NULL,
  detail        TEXT,
  sector        TEXT,
  stage         TEXT,
  location      TEXT,
  source        TEXT DEFAULT 'derived',
  url           TEXT,
  score         INT DEFAULT 0,        -- activity/relevance weight
  signal_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_signals_at     ON market_signals (signal_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_signals_sector ON market_signals (lower(sector));
-- avoid duplicate derived signals per investor
CREATE UNIQUE INDEX IF NOT EXISTS uq_market_signals_derived
  ON market_signals (investor_id, signal_type) WHERE investor_id IS NOT NULL AND source = 'derived';

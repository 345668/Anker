-- Saved fund-forecasting scenarios.
--
-- Persists a named set of forecasting assumptions (deploy %, reserve %, per-scenario
-- exit multiples, Monte-Carlo uncertainty) so a GP can save and reload models instead of
-- re-dialling the sliders. User-scoped; params is a small JSON blob owned by the client.

CREATE TABLE IF NOT EXISTS forecast_scenarios (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT        NOT NULL,
  /** Optional fund/org context for future scoping. */
  fund_id     TEXT,
  name        TEXT        NOT NULL,
  /** { deployPct, reservePct, multiples:{downside,base,upside}, uncertainty }. */
  params      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One scenario name per user (re-saving a name overwrites it).
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS forecast_scenarios_user_idx
  ON forecast_scenarios (user_id, created_at DESC);

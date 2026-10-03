-- Operations telemetry (docs/architecture/37 §5.4, 38 §5): a run id and a stored cost on every AI call, one row per
-- cron execution, and the nightly dependency-check history. Additive and idempotent; no data is rewritten.

-- Which run made the call. Text, because a run id is a UUID the app mints; NULL on every row written before this.
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS run_id text;
-- The estimate at the time of the call (tokens x the catalogue's price, the high end of a range). NULL when the model is
-- unpriced or the provider reported no tokens: unknown, not zero.
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS cost_usd numeric(12,6);
CREATE INDEX IF NOT EXISTS ai_calls_run_idx ON ai_calls (run_id, created_at) WHERE run_id IS NOT NULL;

-- One row per cron execution. A row still 'running' after the job's maxDuration means the platform killed it.
CREATE TABLE IF NOT EXISTS cron_runs (
  id           bigserial PRIMARY KEY,
  job          text NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text NOT NULL DEFAULT 'running',     -- running | ok | failed
  http_status  integer,
  duration_ms  integer,
  error        text,
  result       jsonb
);
CREATE INDEX IF NOT EXISTS cron_runs_job_idx ON cron_runs (job, started_at DESC);
CREATE INDEX IF NOT EXISTS cron_runs_recent_idx ON cron_runs (started_at DESC);

-- The nightly and on-demand dependency check: what answered, what is configured, what is silently missing.
CREATE TABLE IF NOT EXISTS dependency_checks (
  id          bigserial PRIMARY KEY,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  trigger     text NOT NULL DEFAULT 'cron',          -- cron | manual | deploy
  ok          boolean NOT NULL,
  results     jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS dependency_checks_recent_idx ON dependency_checks (checked_at DESC);

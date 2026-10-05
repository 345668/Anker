-- Agent runtime completion (docs/architecture/45): events, memory, eval results. Event runs join the trigger set.
ALTER TABLE agent_executions DROP CONSTRAINT IF EXISTS agent_executions_trigger_check;
ALTER TABLE agent_executions ADD CONSTRAINT agent_executions_trigger_check CHECK (trigger IN ('schedule','manual','event'));
-- An event's run is unique per (workspace, agent, event id), exactly like a period for a schedule.
DROP INDEX IF EXISTS agent_executions_period_idx;
CREATE UNIQUE INDEX IF NOT EXISTS agent_executions_period_idx ON agent_executions (org_id, agent_id, period_key) WHERE trigger IN ('schedule','event');

CREATE TABLE IF NOT EXISTS agent_events (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id        text NOT NULL,
  kind          text NOT NULL,
  subject_id    text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz
);
CREATE INDEX IF NOT EXISTS agent_events_open_idx ON agent_events (created_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS agent_events_org_idx ON agent_events (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS entity_memory (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  key          text NOT NULL,
  value        text NOT NULL,
  source       text NOT NULL DEFAULT 'person' CHECK (source IN ('person','agent','assistant')),
  confidence   numeric,
  valid_until  timestamptz,
  pinned       boolean NOT NULL DEFAULT false,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS entity_memory_key_idx ON entity_memory (org_id, entity_type, entity_id, key);

-- Platform-level (no workspace): results of the evals. Case names and pass/fail only, never tenant content.
CREATE TABLE IF NOT EXISTS eval_runs (
  id         bigserial PRIMARY KEY,
  suite      text NOT NULL,
  case_name  text NOT NULL,
  passed     boolean NOT NULL,
  detail     text,
  ran_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eval_runs_ran_idx ON eval_runs (ran_at DESC);

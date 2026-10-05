-- Phase 2 agent runtime (docs/architecture/44). Definitions live in code; these tables hold a workspace's choices and every run.
CREATE TABLE IF NOT EXISTS agent_settings (
  org_id      text NOT NULL,
  agent_id    text NOT NULL,
  enabled     boolean NOT NULL DEFAULT false,
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled_by  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, agent_id)
);

CREATE TABLE IF NOT EXISTS agent_executions (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id         text NOT NULL,
  agent_id       text NOT NULL,
  agent_version  int NOT NULL DEFAULT 1,
  trigger        text NOT NULL CHECK (trigger IN ('schedule','manual')),
  mode           text NOT NULL DEFAULT 'live' CHECK (mode IN ('live','dry_run')),
  status         text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','killed','budget_stopped')),
  period_key     text,
  requested_by   text,
  plan           jsonb NOT NULL DEFAULT '[]'::jsonb,
  state          jsonb NOT NULL DEFAULT '{}'::jsonb,
  output         jsonb,
  error          text,
  spend_usd      numeric NOT NULL DEFAULT 0,
  attempts       int NOT NULL DEFAULT 0,
  heartbeat_at   timestamptz,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- One scheduled run per workspace, agent and period: two dispatchers cannot run an agent twice.
CREATE UNIQUE INDEX IF NOT EXISTS agent_executions_period_idx ON agent_executions (org_id, agent_id, period_key) WHERE trigger = 'schedule';
CREATE INDEX IF NOT EXISTS agent_executions_org_idx ON agent_executions (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_executions_open_idx ON agent_executions (status, heartbeat_at) WHERE status IN ('queued','running');

ALTER TABLE action_proposals ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE action_proposals ADD COLUMN IF NOT EXISTS execution_id text;

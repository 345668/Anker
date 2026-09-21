-- What the AI actually did. Operational telemetry, not an audit trail.
--
-- Every AI call in the platform already funnels through generateDetailed(),
-- which resolves a provider chain, fails over on 429/5xx, and returns the
-- provider, model, error and upstream status. All of it was discarded by the
-- caller, so nothing could answer "did the Qwen key work last week", "what is
-- a match run costing", or "how often is failover firing" without reproducing
-- the call.
--
-- Deliberately NOT audit_events. That table is actor-centric, append-only and
-- rendered for compliance; this is high-volume machine telemetry with a
-- retention policy, and mixing them would make the audit trail unreadable and
-- the telemetry expensive to query.
--
-- No prompt or completion text is stored. The point is observability of the
-- integration, not a transcript of what users asked — that would turn a
-- metrics table into the most sensitive store in the platform.

CREATE TABLE IF NOT EXISTS ai_calls (
  id            bigserial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- Which task made the call. Nullable because not every call site passes one;
  -- a null here is itself worth seeing, since untagged calls escape the
  -- per-task kill switches in /dashboard/admin/ai-config.
  task          text,

  -- Who answered, and with what. `provider` is the one that actually served
  -- the request, not the one that was configured — those differ whenever
  -- failover fires, which was previously invisible.
  provider      text NOT NULL,
  model         text,

  -- Chain position: 0 when the first-choice provider answered, 1+ when
  -- failover reached this one. The single most useful number here, because a
  -- platform that is silently running on its third choice looks healthy.
  attempt       smallint NOT NULL DEFAULT 0,

  ok            boolean NOT NULL,
  -- Short reason on failure. Truncated at the call site; never a stack trace.
  error         text,
  http_status   integer,

  duration_ms   integer,
  -- Token counts where the provider reports them. Null means not reported,
  -- which is different from zero, so cost estimates can say what they cover.
  prompt_tokens integer,
  output_tokens integer,

  -- Attribution, when the call happens inside a request that has it.
  workspace_id  text,
  actor_email   text
);

-- Time-ordered reads dominate: a dashboard asks for a window and groups it.
CREATE INDEX IF NOT EXISTS ai_calls_created_idx ON ai_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_calls_task_idx ON ai_calls (task, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_calls_provider_idx ON ai_calls (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_calls_workspace_idx ON ai_calls (workspace_id, created_at DESC);
-- Failures are a small fraction of rows and the thing most often asked about.
CREATE INDEX IF NOT EXISTS ai_calls_failures_idx ON ai_calls (created_at DESC) WHERE ok = false;

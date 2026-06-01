-- agent_runs — history of every runAgent() invocation.
--
-- One row per call to `runAgent` (or per entry inside a `tick`).  We
-- store the full step array as JSONB so the admin UI can render the
-- same RunCard it does live, but against persisted data.
--
-- The table is admin-scoped — `user_id` is the actor who triggered the
-- run (admin or a system bot), not the owner of the CRM entry.

CREATE TABLE IF NOT EXISTS agent_runs (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  crm_entry_id  TEXT NOT NULL REFERENCES crm_entries(id) ON DELETE CASCADE,
  user_id       TEXT,             -- whoever kicked off the run
  mode          TEXT NOT NULL CHECK (mode IN ('auto','research-only','draft-only','tick')),
  trigger       TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual','tick','schedule','api')),
  steps         JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_ms   INT NOT NULL DEFAULT 0,
  final_stage   TEXT,
  error         TEXT,             -- non-null if the run failed before completion
  started_at    TIMESTAMPTZ DEFAULT NOW(),
  finished_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_runs_entry_idx
  ON agent_runs (crm_entry_id, started_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_started_idx
  ON agent_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_mode_idx
  ON agent_runs (mode, started_at DESC);

-- Optional helper view: latest run per entry (for "Last seen" badges
-- in the CRM kanban).
CREATE OR REPLACE VIEW agent_runs_latest AS
SELECT DISTINCT ON (crm_entry_id)
  crm_entry_id, id AS run_id, mode, final_stage, error, started_at, duration_ms
FROM agent_runs
ORDER BY crm_entry_id, started_at DESC;

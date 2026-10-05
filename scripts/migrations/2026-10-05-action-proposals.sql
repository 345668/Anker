-- Phase 1 action layer (docs/architecture/43): proposals the assistant makes, a person decides, and an owner-set autonomy switch.
-- org_id is text like organizations.id; ids are text so nothing here casts to uuid.
CREATE TABLE IF NOT EXISTS action_proposals (
  id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id           text NOT NULL,
  persona          text,
  requested_by     text NOT NULL,
  capability       text NOT NULL,
  input            jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary          text NOT NULL,
  diff             jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence         jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_class       text NOT NULL CHECK (risk_class IN ('R0','R1','R2','R3')),
  run_id           text,
  chat_id          text,
  source_trust     text NOT NULL DEFAULT 'trusted' CHECK (source_trust IN ('trusted','untrusted')),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected','undone','expired','failed')),
  decided_by       text,
  decided_at       timestamptz,
  applied_at       timestamptz,
  undone_at        timestamptz,
  undo             jsonb,
  failure          text,
  auto_committed   boolean NOT NULL DEFAULT false,
  idempotency_key  text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '14 days')
);
CREATE UNIQUE INDEX IF NOT EXISTS action_proposals_idem_idx ON action_proposals (org_id, idempotency_key);
CREATE INDEX IF NOT EXISTS action_proposals_org_status_idx ON action_proposals (org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS action_proposals_run_idx ON action_proposals (org_id, run_id);

CREATE TABLE IF NOT EXISTS workspace_autonomy (
  org_id       text NOT NULL,
  risk_class   text NOT NULL CHECK (risk_class IN ('R0','R1','R2','R3')),
  auto_commit  boolean NOT NULL DEFAULT false,
  set_by       text,
  set_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, risk_class)
);

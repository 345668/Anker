-- Immutable audit trail. Append-only: who did what, to which entity, when.
-- Rendered at /dashboard/admin/audit. No UPDATE/DELETE path in the app.
CREATE TABLE IF NOT EXISTS audit_events (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  actor_id     text,
  actor_email  text,
  action       text NOT NULL,
  target_type  text,
  target_id    text,
  target_label text,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events (actor_email, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_target_idx ON audit_events (target_type, target_id);

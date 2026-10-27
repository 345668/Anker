-- Halyard governance (docs/architecture/62 sections 13-15, slice H6). Additive; idempotent. No call content anywhere in this file.
ALTER TABLE halyard_settings ADD COLUMN IF NOT EXISTS require_informed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE halyard_sessions ADD COLUMN IF NOT EXISTS consent_version TEXT NOT NULL DEFAULT 'v1';

-- One row per audio upload attempt: counts and timings only, so the platform can see transcription health without seeing any call.
CREATE TABLE IF NOT EXISTS halyard_uploads (
  id         BIGSERIAL PRIMARY KEY,
  org_id     TEXT NOT NULL,
  ok         BOOLEAN NOT NULL,
  reason     TEXT,
  ms         INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_halyard_uploads_org_time ON halyard_uploads (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_halyard_uploads_time ON halyard_uploads (created_at DESC);

-- Plans that have the assistant also get Halyard (the switch halyard_web stays off until the founder turns it on); 600 listening minutes a month unless the plan already says otherwise.
UPDATE plan_catalog SET features = features || '{"halyard":true}'::jsonb WHERE COALESCE(features->>'assistant', 'false') = 'true' AND NOT (features ? 'halyard');
UPDATE plan_catalog SET limits = limits || '{"halyard_minutes_month":600}'::jsonb WHERE COALESCE(features->>'halyard', 'false') = 'true' AND NOT (limits ? 'halyard_minutes_month');
UPDATE plan_catalog SET limits = limits || '{"halyard_sessions_live":1}'::jsonb WHERE COALESCE(features->>'halyard', 'false') = 'true' AND NOT (limits ? 'halyard_sessions_live');

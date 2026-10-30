-- Halyard custom playbooks (docs/architecture/77, H8a). Additive; idempotent. The text is encrypted by the application.
CREATE TABLE IF NOT EXISTS halyard_playbooks (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id      TEXT NOT NULL,
  scope       TEXT NOT NULL CHECK (scope IN ('personal','workspace')),
  user_id     TEXT NOT NULL,                -- the author (and, for a personal playbook, the only person who can use it)
  slug        TEXT NOT NULL,
  label       TEXT NOT NULL,
  markdown_enc TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT,
  UNIQUE (org_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_halyard_playbooks_org ON halyard_playbooks (org_id, scope);

-- Halyard sessions backend (docs/architecture/62 section 10, slice H2). Additive; idempotent.
-- Text is encrypted by the application (*_enc). Audio is never stored.
CREATE TABLE IF NOT EXISTS halyard_sessions (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id                TEXT NOT NULL,
  user_id               TEXT NOT NULL,
  source                TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web','desktop')),
  mode                  TEXT NOT NULL DEFAULT 'general',
  title                 TEXT,
  language              TEXT,
  state                 TEXT NOT NULL DEFAULT 'live' CHECK (state IN ('live','paused','ended','abandoned')),
  started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at              TIMESTAMPTZ,
  consent_attested_at   TIMESTAMPTZ NOT NULL,
  participants_informed BOOLEAN NOT NULL DEFAULT false,
  crm_entry_id          TEXT,
  call_id               TEXT,
  stt                   TEXT NOT NULL DEFAULT 'server' CHECK (stt IN ('server','local','wasm')),
  device_id             TEXT,
  audio_seconds         INTEGER NOT NULL DEFAULT 0,
  chars                 INTEGER NOT NULL DEFAULT 0,
  folded_upto           INTEGER NOT NULL DEFAULT 0,
  delete_after          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_halyard_sessions_org ON halyard_sessions (org_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_halyard_sessions_user_live ON halyard_sessions (user_id) WHERE state IN ('live','paused');

CREATE TABLE IF NOT EXISTS halyard_segments (
  session_id  TEXT NOT NULL REFERENCES halyard_sessions(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  channel     TEXT NOT NULL CHECK (channel IN ('you','them','room')),
  started_ms  INTEGER,
  ended_ms    INTEGER,
  text_enc    TEXT NOT NULL,
  confidence  REAL,
  final       BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (session_id, seq)
);

CREATE TABLE IF NOT EXISTS halyard_briefs (
  session_id  TEXT NOT NULL REFERENCES halyard_sessions(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  upto_seq    INTEGER NOT NULL,
  brief_enc   TEXT NOT NULL,
  figures_enc TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, version)
);

CREATE TABLE IF NOT EXISTS halyard_suggestions (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id     TEXT NOT NULL REFERENCES halyard_sessions(id) ON DELETE CASCADE,
  action         TEXT NOT NULL,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_token_ms INTEGER,
  total_ms       INTEGER,
  model          TEXT,
  tokens_in      INTEGER,
  tokens_out     INTEGER,
  text_enc       TEXT,
  shown          BOOLEAN NOT NULL DEFAULT false,
  used           BOOLEAN NOT NULL DEFAULT false,
  rating         SMALLINT
);
CREATE INDEX IF NOT EXISTS idx_halyard_suggestions_session ON halyard_suggestions (session_id, requested_at);

CREATE TABLE IF NOT EXISTS halyard_notes (
  session_id TEXT NOT NULL REFERENCES halyard_sessions(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  body_enc   TEXT NOT NULL,
  edited_by  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, version)
);

CREATE TABLE IF NOT EXISTS halyard_prep (
  org_id      TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  mode        TEXT NOT NULL,
  context_enc TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id, mode)
);

CREATE TABLE IF NOT EXISTS halyard_viewers (
  session_id     TEXT NOT NULL REFERENCES halyard_sessions(id) ON DELETE CASCADE,
  viewer_user_id TEXT NOT NULL,
  granted_by     TEXT NOT NULL,
  revoked_at     TIMESTAMPTZ,
  PRIMARY KEY (session_id, viewer_user_id)
);

-- Workspace retention (months; null = the default of 12). Kept on the policy row's sibling table so it can be set per workspace.
CREATE TABLE IF NOT EXISTS halyard_settings (
  org_id           TEXT PRIMARY KEY,
  retention_months INTEGER CHECK (retention_months IS NULL OR retention_months BETWEEN 1 AND 120),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_flags (key, enabled, rollout_pct, description)
VALUES ('halyard_web', false, 100, 'Doc 62: Halyard live call assistant in the browser. Off: sessions cannot be created.')
ON CONFLICT (key) DO NOTHING;
UPDATE plan_catalog SET features = features || '{"halyard":true}'::jsonb, limits = limits || '{"halyard_minutes_month":600,"halyard_sessions_live":1}'::jsonb WHERE plan = 'internal';

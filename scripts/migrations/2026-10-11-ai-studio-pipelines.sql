-- Media Studio staged pipelines and subject replacement (docs/architecture/51). Foundation only: no provider is called by anything here.
-- Every table is keyed by workspace (scope_key / org_id) so tenant export and deletion reach it (docs/architecture/37).
CREATE TABLE IF NOT EXISTS ai_studio_consents (
  id text PRIMARY KEY, user_id text NOT NULL, scope_key text NOT NULL, org_id text,
  statement_version text NOT NULL,
  source_sha256 text NOT NULL,
  reference_sha256 text[] NOT NULL DEFAULT '{}',
  subjects text NOT NULL CHECK (length(btrim(subjects)) >= 3),
  voice_altered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_studio_consents_scope ON ai_studio_consents(scope_key, created_at DESC);
CREATE TABLE IF NOT EXISTS ai_studio_pipelines (
  id text PRIMARY KEY, user_id text NOT NULL, scope_key text NOT NULL, org_id text,
  recipe_id text NOT NULL, recipe_version integer NOT NULL,
  request_key text NOT NULL,
  consent_id text NOT NULL REFERENCES ai_studio_consents(id),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','awaiting_review','failed','canceled','completed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope_key, request_key)
);
CREATE INDEX IF NOT EXISTS ai_studio_pipelines_scope ON ai_studio_pipelines(scope_key, created_at DESC);
CREATE TABLE IF NOT EXISTS ai_studio_stages (
  pipeline_id text NOT NULL REFERENCES ai_studio_pipelines(id) ON DELETE CASCADE,
  ord integer NOT NULL, kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  job_id text, error text, started_at timestamptz, ended_at timestamptz,
  PRIMARY KEY (pipeline_id, ord)
);
CREATE TABLE IF NOT EXISTS ai_studio_artifacts (
  id text PRIMARY KEY,
  pipeline_id text NOT NULL REFERENCES ai_studio_pipelines(id) ON DELETE CASCADE,
  stage_ord integer NOT NULL, kind text NOT NULL,
  pathname text NOT NULL, content_type text NOT NULL, bytes integer NOT NULL CHECK (bytes > 0),
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, kind)
);
CREATE TABLE IF NOT EXISTS ai_studio_reviews (
  id text PRIMARY KEY,
  pipeline_id text NOT NULL REFERENCES ai_studio_pipelines(id) ON DELETE CASCADE,
  gate text NOT NULL CHECK (gate IN ('input','final')),
  artifact_set_hash text NOT NULL,
  approved boolean NOT NULL, note text,
  reviewer text NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_studio_reviews_gate ON ai_studio_reviews(pipeline_id, gate, reviewed_at DESC);
ALTER TABLE ai_studio_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_studio_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_studio_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_studio_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_studio_reviews ENABLE ROW LEVEL SECURITY;
INSERT INTO platform_flags (key, enabled, rollout_pct, description) VALUES
  ('ai_studio_replace', false, 100, 'Media Studio: subject replacement pipelines. Needs counsel sign-off on the terms and the consent, likeness and provenance controls (doc 51) before it is switched on for customers')
ON CONFLICT (key) DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS ai_studio_pipelines_consent ON ai_studio_pipelines(consent_id);

-- Media Studio: self-hosted ComfyUI behind a platform flag (docs/architecture/49). Off until a recipe is verified on a GPU.
ALTER TABLE ai_studio_jobs ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'dashscope';
ALTER TABLE ai_studio_jobs ADD COLUMN IF NOT EXISTS recipe_id text;
ALTER TABLE ai_studio_jobs ADD COLUMN IF NOT EXISTS recipe_version integer;
CREATE INDEX IF NOT EXISTS ai_studio_jobs_lost ON ai_studio_jobs(created_at) WHERE provider = 'comfy' AND provider_id IS NULL;
INSERT INTO platform_flags (key, enabled, rollout_pct, description) VALUES
  ('ai_studio_comfy', false, 100, 'Media Studio: allow self-hosted ComfyUI recipes. Needs COMFY_BASE_URL and COMFY_API_KEY, a verified recipe and content screening')
ON CONFLICT (key) DO NOTHING;

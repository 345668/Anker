-- Media Studio v2 (docs/architecture/48): audio assets (uploaded or spoken dialogue) that drive video, and the job's audio capability link.
ALTER TABLE ai_studio_assets DROP CONSTRAINT IF EXISTS ai_studio_assets_kind_check;
ALTER TABLE ai_studio_assets ADD CONSTRAINT ai_studio_assets_kind_check CHECK (kind IN ('image','video','audio'));
ALTER TABLE ai_studio_assets ADD COLUMN IF NOT EXISTS duration_ms integer;
ALTER TABLE ai_studio_jobs ADD COLUMN IF NOT EXISTS audio_asset_id text REFERENCES ai_studio_assets(id);
ALTER TABLE ai_studio_jobs ADD COLUMN IF NOT EXISTS audio_token_hash text;

CREATE TABLE IF NOT EXISTS ai_studio_assets (
 id text PRIMARY KEY,user_id text NOT NULL,scope_key text NOT NULL,job_id text,
 kind text NOT NULL CHECK(kind IN ('image','video')),pathname text NOT NULL,filename text NOT NULL,
 content_type text NOT NULL,bytes integer NOT NULL CHECK(bytes>0),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_studio_assets_owner ON ai_studio_assets(user_id,scope_key);
CREATE UNIQUE INDEX IF NOT EXISTS ai_studio_assets_output ON ai_studio_assets(job_id) WHERE job_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS ai_studio_jobs (
 id text PRIMARY KEY,user_id text NOT NULL,scope_key text NOT NULL,org_id text,
 request_key text NOT NULL,request_hash text NOT NULL,model text NOT NULL,kind text NOT NULL CHECK(kind IN ('image','video')),
 prompt text NOT NULL,settings jsonb NOT NULL,status text NOT NULL CHECK(status IN ('submitting','queued','running','saving','completed','failed','blocked','canceled','uncertain')),
 provider_id text,source_asset_id text REFERENCES ai_studio_assets(id),source_token_hash text,error text,favorite boolean NOT NULL DEFAULT false,
 lease_until timestamptz,lease_token text,next_poll_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,scope_key,request_key)
);
CREATE INDEX IF NOT EXISTS ai_studio_jobs_history ON ai_studio_jobs(user_id,scope_key,created_at DESC);
CREATE INDEX IF NOT EXISTS ai_studio_jobs_pending ON ai_studio_jobs(next_poll_at) WHERE status IN ('submitting','queued','running','saving');
CREATE TABLE IF NOT EXISTS ai_studio_scope_locks(scope_key text PRIMARY KEY);
-- Serialized by workspace, across users/instances. Duplicate requests consume no quota.
CREATE OR REPLACE FUNCTION reserve_ai_studio_job(p_id text,p_user text,p_scope text,p_org text,p_key text,p_hash text,p_model text,p_kind text,p_prompt text,p_settings jsonb,p_source text,p_token text)
RETURNS TABLE(job_id text,created boolean) LANGUAGE plpgsql AS $$
DECLARE old_job ai_studio_jobs%ROWTYPE;
BEGIN
 INSERT INTO ai_studio_scope_locks(scope_key) VALUES(p_scope) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM ai_studio_scope_locks WHERE scope_key=p_scope FOR UPDATE;
 SELECT * INTO old_job FROM ai_studio_jobs WHERE user_id=p_user AND scope_key=p_scope AND request_key=p_key;
 IF FOUND THEN
  IF old_job.request_hash<>p_hash THEN RAISE EXCEPTION 'Request key already used' USING ERRCODE='22023';END IF;
  RETURN QUERY SELECT old_job.id,false;RETURN;
 END IF;
 IF (SELECT count(*) FROM ai_studio_jobs WHERE scope_key=p_scope AND created_at>=date_trunc('day',now()))>=30
 OR (SELECT count(*) FROM ai_studio_jobs WHERE scope_key=p_scope AND user_id=p_user AND created_at>=date_trunc('day',now()))>=20
 OR (SELECT count(*) FROM ai_studio_jobs WHERE scope_key=p_scope AND user_id=p_user AND status IN ('submitting','queued','running','saving') AND created_at>now()-interval '2 hours')>=3
 THEN RAISE EXCEPTION 'Media generation limit reached' USING ERRCODE='54000';END IF;
 INSERT INTO ai_studio_jobs(id,user_id,scope_key,org_id,request_key,request_hash,model,kind,prompt,settings,status,source_asset_id,source_token_hash)
 VALUES(p_id,p_user,p_scope,p_org,p_key,p_hash,p_model,p_kind,p_prompt,p_settings,'submitting',p_source,p_token);
 RETURN QUERY SELECT p_id,true;
END $$;
ALTER TABLE ai_studio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_studio_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_studio_scope_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION reserve_ai_studio_job(text,text,text,text,text,text,text,text,text,jsonb,text,text) FROM PUBLIC;

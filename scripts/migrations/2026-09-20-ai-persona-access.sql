-- Apply before the AI persona access rollout. Legacy artifact ownership remains valid.
ALTER TABLE private_artifacts ALTER COLUMN org_id DROP NOT NULL;
ALTER TABLE private_artifacts ADD COLUMN IF NOT EXISTS scope_key text;
CREATE INDEX IF NOT EXISTS private_artifacts_scope_idx ON private_artifacts(user_id,scope_key);
CREATE TABLE IF NOT EXISTS ai_media_tasks (
  task_id text PRIMARY KEY,
  user_id text NOT NULL,
  scope_key text NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_media_tasks_owner_idx ON ai_media_tasks(user_id,scope_key);

-- Legacy unscoped chats are retained but not assigned to an arbitrary workspace.
ALTER TABLE IF EXISTS anker_chats ADD COLUMN IF NOT EXISTS scope_key text;
ALTER TABLE IF EXISTS anker_chats ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;

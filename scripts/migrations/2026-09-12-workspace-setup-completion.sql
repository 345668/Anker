-- Apply after 2026-09-09-audit-repairs.sql and the workspace/funds foundations.
-- Existing completed drafts remain intact and are repaired explicitly on resume.
ALTER TABLE onboarding_drafts ADD COLUMN IF NOT EXISTS workspace_id text REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS onboarding_drafts_workspace_idx ON onboarding_drafts(workspace_id);

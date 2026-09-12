-- Native decks and planning records are private to a user AND active workspace.
-- Legacy decks remain intact for controlled migration; no ambiguous ownership backfill.
CREATE TABLE IF NOT EXISTS workspace_decks (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id text NOT NULL,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  title text NOT NULL,
  context jsonb NOT NULL,
  slides jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workspace_decks_scope_idx ON workspace_decks(user_id, org_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS planning_scenarios (
  user_id text NOT NULL,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tool text NOT NULL CHECK (tool IN ('runway', 'cap-table')),
  state jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id, tool)
);

-- Database-backed bytes give small generated files durable, cross-instance storage.
-- No public directory, temporary file, or unauthenticated Blob proxy is involved.
CREATE TABLE IF NOT EXISTS private_artifacts (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  filename text NOT NULL,
  content_type text NOT NULL,
  content bytea NOT NULL CHECK (octet_length(content) <= 20971520),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX IF NOT EXISTS private_artifacts_scope_idx ON private_artifacts(user_id, org_id);
CREATE INDEX IF NOT EXISTS private_artifacts_expiry_idx ON private_artifacts(expires_at);

-- Stable, non-null identities for new imports. Preserve historical duplicates
-- and their notes/round associations; only the earliest record is canonical.
ALTER TABLE crm_entries ADD COLUMN IF NOT EXISTS import_key text;
WITH ranked AS (
  SELECT id, CASE WHEN investor_id IS NOT NULL THEN 'contact:' || investor_id ELSE 'firm:' || firm_id END AS identity,
    row_number() OVER (PARTITION BY user_id, source,
      CASE WHEN investor_id IS NOT NULL THEN 'contact:' || investor_id ELSE 'firm:' || firm_id END
      ORDER BY added_at, id) AS n
  FROM crm_entries WHERE investor_id IS NOT NULL OR firm_id IS NOT NULL
)
UPDATE crm_entries e SET import_key = r.identity FROM ranked r
WHERE e.id = r.id AND r.n = 1 AND e.import_key IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_entries_import_identity_idx ON crm_entries(user_id, source, import_key);
CREATE OR REPLACE FUNCTION set_crm_import_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source IN ('founder_matching', 'lp_matching') THEN
    NEW.import_key := CASE WHEN NEW.investor_id IS NOT NULL THEN 'contact:' || NEW.investor_id
      WHEN NEW.firm_id IS NOT NULL THEN 'firm:' || NEW.firm_id ELSE NULL END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crm_import_identity ON crm_entries;
CREATE TRIGGER crm_import_identity BEFORE INSERT ON crm_entries
  FOR EACH ROW EXECUTE FUNCTION set_crm_import_identity();


ALTER TABLE investor_updates ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
ALTER TABLE investor_updates ADD COLUMN IF NOT EXISTS delivery_snapshot jsonb;
ALTER TABLE investor_updates ADD COLUMN IF NOT EXISTS send_lease_until timestamptz;
ALTER TABLE investor_updates ADD COLUMN IF NOT EXISTS send_token text;
ALTER TABLE investor_updates ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE investor_update_recipients DROP CONSTRAINT IF EXISTS investor_update_recipients_delivery_status_check;
ALTER TABLE investor_update_recipients ADD CONSTRAINT investor_update_recipients_delivery_status_check
  CHECK (delivery_status IN ('pending', 'sent', 'failed', 'skipped'));

-- The verification passport (docs/architecture/70). Additive. Investor-owned. Files are encrypted by the application before they are stored.
CREATE TABLE IF NOT EXISTS passport_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES investor_entities(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  content_enc bytea NOT NULL,
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS passport_documents_entity_idx ON passport_documents (entity_id, doc_type, created_at DESC);
CREATE TABLE IF NOT EXISTS passport_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES passport_documents(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES investor_entities(id) ON DELETE CASCADE,
  relationship_id uuid NOT NULL REFERENCES fund_relationships(id) ON DELETE CASCADE,
  with_fund text NOT NULL,                  -- named so the table is not mistaken for a fund-keyed one: it is the investor's
  lp_id text NOT NULL,
  doc_type text NOT NULL,
  sha256 text NOT NULL,
  shared_by text NOT NULL,
  shared_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  retained boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS passport_shares_entity_idx ON passport_shares (entity_id, shared_at DESC);

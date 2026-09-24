-- Extract a document once (docs/architecture/21 §2).
--
-- A deck's extraction is a pure function of its bytes and the extractor, but
-- it was recomputed on every run — and because the model writes the prose the
-- semantic query vector is built from, two runs of one deck produced two
-- different shortlists (10,000 firm groups and 9,239).
--
-- The row holds fields derived from a confidential document, so it is as
-- sensitive as the deck: scoped to the workspace that uploaded it, never read
-- across tenants, and removed with the workspace.

CREATE TABLE IF NOT EXISTS document_extractions (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id      text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- sha256 of the file bytes.
  doc_hash    text NOT NULL,
  -- 'startup' (a founder's deck) | 'fund' (a GP's deck).
  kind        text NOT NULL CHECK (kind IN ('startup', 'fund')),
  -- Bumped when the prompt or field set changes, so stale output is never served.
  version     text NOT NULL,
  fields      jsonb NOT NULL,
  -- Provenance, deliberately not part of the key: a fallback to another
  -- provider must not produce a second profile for the same document.
  model       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '180 days'
);

-- One entry per document per workspace per extractor version.
CREATE UNIQUE INDEX IF NOT EXISTS document_extractions_key_idx
  ON document_extractions (org_id, doc_hash, kind, version);
CREATE INDEX IF NOT EXISTS document_extractions_expiry_idx
  ON document_extractions (expires_at);

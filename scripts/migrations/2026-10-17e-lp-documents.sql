-- The LP leg, slice L4 (docs/architecture/60 section 8): documents the fund publishes to its investors (tax documents, annual statements, notices), one investor or all of the
-- fund's. PDFs are kept in the database with a SHA-256, like the subscription package. Additive.
CREATE TABLE IF NOT EXISTS lp_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id text NOT NULL,
  lp_id text,                                  -- null: every investor of the fund
  category text NOT NULL CHECK (category IN ('tax', 'annual_statement', 'notice', 'other')),
  title text NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/pdf',
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  content bytea NOT NULL,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lp_documents_fund_idx ON lp_documents (fund_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lp_documents_lp_idx ON lp_documents (lp_id) WHERE lp_id IS NOT NULL;

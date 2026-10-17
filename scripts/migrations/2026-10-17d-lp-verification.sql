-- The LP leg, slice L3 (docs/architecture/60 section 6): identity and address documents an investor sends, and what they declare about themselves. Files are
-- encrypted by the application (AES-256-GCM) before they reach the database; the case and its document checklist are the existing kyc_cases and kyc_documents. Additive.
CREATE TABLE IF NOT EXISTS lp_verification (
  lp_id text PRIMARY KEY,
  fund_id text NOT NULL,
  case_id text,
  investor_category text CHECK (investor_category IN ('professional', 'semi_professional', 'other', 'unsure')),
  owners_enc text,                           -- for entities: who owns and controls it (personal data of third parties, encrypted)
  declared_at timestamptz,
  submitted_at timestamptz
);

CREATE TABLE IF NOT EXISTS kyc_document_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id text NOT NULL,
  case_id text NOT NULL,
  doc_id text NOT NULL,
  lp_id text,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,                      -- of the original file, before encryption
  content_enc bytea NOT NULL,
  uploaded_by text NOT NULL DEFAULT 'lp',
  superseded boolean NOT NULL DEFAULT false,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_document_files_doc_idx ON kyc_document_files (doc_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kyc_document_files_case_idx ON kyc_document_files (case_id);

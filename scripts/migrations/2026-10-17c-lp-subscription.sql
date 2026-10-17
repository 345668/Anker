-- The LP leg, slice L2 (docs/architecture/60 section 7): the fund's subscription package (versioned), what is sent to each LP, the signed copy that comes back, and the
-- fund's decision. Files are kept in the database (PDF, small) with a SHA-256 of their content. Additive. Existing LPs are untouched; new LPs start as 'prospective'.
ALTER TABLE fund_lps ALTER COLUMN subscription_status SET DEFAULT 'prospective';

CREATE TABLE IF NOT EXISTS fund_subscription_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id text NOT NULL,
  version integer NOT NULL,
  title text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'current', 'retired')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS fund_subscription_packages_version_uq ON fund_subscription_packages (fund_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS fund_subscription_packages_one_draft_uq ON fund_subscription_packages (fund_id) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS fund_subscription_packages_one_current_uq ON fund_subscription_packages (fund_id) WHERE status = 'current';

CREATE TABLE IF NOT EXISTS lp_subscription_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id text NOT NULL,
  package_id uuid,
  lp_id text,
  role text NOT NULL CHECK (role IN ('package_doc', 'signed_copy', 'countersigned_copy')),
  title text,
  filename text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/pdf',
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  content bytea NOT NULL,
  scanned boolean NOT NULL DEFAULT false,      -- no virus scanner is wired in yet: false means "not scanned"
  uploaded_by text,
  superseded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lp_subscription_files_package_idx ON lp_subscription_files (package_id) WHERE role = 'package_doc';
CREATE INDEX IF NOT EXISTS lp_subscription_files_lp_idx ON lp_subscription_files (lp_id, created_at DESC) WHERE lp_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lp_subscriptions (
  lp_id text PRIMARY KEY,
  fund_id text NOT NULL,
  package_id uuid NOT NULL,
  commitment_amount numeric NOT NULL,
  share_class text,
  subscription_date date,
  status text NOT NULL CHECK (status IN ('sent', 'returned', 'countersigned', 'rejected')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by text,
  returned_at timestamptz,
  ack_name text,
  ack_at timestamptz,
  ack_ip text,
  ack_hashes jsonb,
  decided_at timestamptz,
  decided_by text,
  rejection_reason text
);

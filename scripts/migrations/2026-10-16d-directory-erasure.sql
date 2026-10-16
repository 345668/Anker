-- Erasure of directory persons (docs/architecture/54, slice D4). Additive.
-- One notice per (request, workspace): a workspace that keeps its own copy of an erased person is told once, with a count and no personal data.
CREATE TABLE IF NOT EXISTS directory_erasure_notices (
  request_id text NOT NULL,
  org_id text NOT NULL,
  records integer NOT NULL,
  mailed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, org_id)
);

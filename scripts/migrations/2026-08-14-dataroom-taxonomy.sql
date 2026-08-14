-- Data-room taxonomy foundation (Phase 1). Additive + backward-compatible.
-- See docs/data-room-implementation.md §6.

ALTER TABLE data_room_documents
  ADD COLUMN IF NOT EXISTS room_type   text NOT NULL DEFAULT 'fund'
    CHECK (room_type IN ('fund', 'founder')),
  ADD COLUMN IF NOT EXISTS section     text,           -- taxonomy section key
  ADD COLUMN IF NOT EXISTS company_id  text,           -- founder room owner (workspace/company)
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS drd_room_section_idx ON data_room_documents (room_type, section);
CREATE INDEX IF NOT EXISTS drd_company_idx      ON data_room_documents (company_id);

-- Founder-room investor access grants (§6, §11 decision 2): tokenized,
-- email-gated, watermarked, expiring, revocable.
CREATE TABLE IF NOT EXISTS data_room_access_grants (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id    text NOT NULL,
  token         text NOT NULL UNIQUE,
  grantee_email text NOT NULL,
  scope         text NOT NULL DEFAULT 'all',     -- 'all' | (future) section list
  watermark     boolean NOT NULL DEFAULT true,
  expires_at    timestamptz,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS drag_company_idx ON data_room_access_grants (company_id);
CREATE INDEX IF NOT EXISTS drag_token_idx   ON data_room_access_grants (token);

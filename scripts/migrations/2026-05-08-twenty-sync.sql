-- Twenty sync columns on crm_entries.
--
-- After pushCrmEntry() succeeds the four Twenty IDs are written here so:
--   1. The CRM card can show a "View in Twenty" link without an extra
--      GraphQL round-trip on every render.
--   2. Re-syncs are idempotent (we already filter by `ankerCrmEntryId`
--      in the GraphQL queries; this is a redundancy backstop).
--   3. The kanban can render a "synced N min ago" badge.

ALTER TABLE crm_entries
  ADD COLUMN IF NOT EXISTS twenty_company_id      TEXT,
  ADD COLUMN IF NOT EXISTS twenty_person_id       TEXT,
  ADD COLUMN IF NOT EXISTS twenty_opportunity_id  TEXT,
  ADD COLUMN IF NOT EXISTS twenty_opportunity_url TEXT,
  ADD COLUMN IF NOT EXISTS twenty_last_synced_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS twenty_sync_error      TEXT;

CREATE INDEX IF NOT EXISTS crm_entries_twenty_opportunity_idx
  ON crm_entries (twenty_opportunity_id)
  WHERE twenty_opportunity_id IS NOT NULL;

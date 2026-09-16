-- Repeat conversations must be able to produce repeat follow-ups.
--
-- Until now outreach_messages carried one unique slot per
-- (user_id, crm_entry_id, kind). A follow-up drafted from a call therefore
-- consumed the only 'follow_up' slot that contact would ever have: a second
-- call to the same investor could not create a draft, even long after the
-- first had been sent. Idempotency was attached to the CONTACT when it belongs
-- to the CALL.
--
-- outreach_messages.call_id makes that explicit:
--   • rows WITHOUT a call keep the old one-per-(sender, contact, kind) slot,
--     so every existing upsert path is unchanged in meaning;
--   • rows WITH a call are unique per call instead, so each conversation owns
--     its own draft and earlier sent messages are preserved as history.
--
-- COORDINATED RELEASE. Postgres cannot infer a partial index from a literal
-- kind value, so `ON CONFLICT (user_id, crm_entry_id, kind)` stops matching the
-- moment this index becomes partial. Every upsert site must carry the matching
-- `WHERE call_id IS NULL` predicate BEFORE this runs, or those writes fail with
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
-- Deploy the application revision first, or run both together.

ALTER TABLE outreach_messages ADD COLUMN IF NOT EXISTS call_id text;

-- One draft per call. Partial so the column stays optional for every other
-- message; NULLs are distinct in Postgres but the predicate makes that explicit.
CREATE UNIQUE INDEX IF NOT EXISTS outreach_messages_call_idx
  ON outreach_messages (call_id) WHERE call_id IS NOT NULL;

-- Look-ups from a call to its message.
CREATE INDEX IF NOT EXISTS outreach_messages_call_lookup_idx
  ON outreach_messages (call_id);

-- Re-scope the sender/contact/kind slot to non-call messages only.
DROP INDEX IF EXISTS outreach_messages_sender_contact_kind_idx;
CREATE UNIQUE INDEX IF NOT EXISTS outreach_messages_sender_contact_kind_idx
  ON outreach_messages (user_id, crm_entry_id, kind) WHERE call_id IS NULL;

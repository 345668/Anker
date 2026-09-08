-- Allow outreach_messages.kind = 'schedule':
--   a booking ask sent to an investor who signaled interest (INTERESTED reply).
--   Kept distinct from 'reply' so the interested→call conversion is measurable
--   and so a scheduling mail and a later plain reply don't collide on the
--   UNIQUE (crm_entry_id, kind) index.
-- Re-runnable (drop-if-exists then add).
ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_kind_check;

ALTER TABLE outreach_messages ADD CONSTRAINT outreach_messages_kind_check
  CHECK (kind = ANY (ARRAY[
    'connection_request','follow_up','different_angle','close_loop',
    'email_intro','dm_intro','reply','reengage','schedule'
  ]));

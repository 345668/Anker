-- Allow two new outreach_messages kinds:
--   'reply'    — the founder's approved response to an inbound investor reply
--                (P0-4, lib/outreach/deliver.ts)
--   'reengage' — a re-engagement follow-up drafted when reengage_on comes due
--                (P1-5, app/api/cron/outreach-reengage)
-- The prior CHECK only permitted the outbound sequence kinds, so inserting
-- either of these failed. Re-runnable (drop-if-exists then add).

ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_kind_check;

ALTER TABLE outreach_messages ADD CONSTRAINT outreach_messages_kind_check
  CHECK (kind = ANY (ARRAY[
    'connection_request','follow_up','different_angle','close_loop',
    'email_intro','dm_intro','reply','reengage'
  ]));

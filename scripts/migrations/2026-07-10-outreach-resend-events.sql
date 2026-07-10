-- Resend delivery telemetry on outreach messages.
--
-- resend_last_event : last event Resend reported (delivered, opened,
--                     clicked, bounced, complained, delivery_delayed)
-- bounced_at / complained_at : stamped when those events arrive; bounces
--                     also copy the reason into failed_reason.

alter table outreach_messages add column if not exists resend_last_event text;
alter table outreach_messages add column if not exists bounced_at timestamptz;
alter table outreach_messages add column if not exists complained_at timestamptz;

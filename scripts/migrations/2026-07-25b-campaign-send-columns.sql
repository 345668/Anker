-- Draft + send tracking columns for campaign_crm_entries. The founder-campaign
-- sender (cron: campaign-send) drafts one personalized email per investor and
-- sends in progressive waves, so each entry carries its own draft, wave number,
-- and send result. Additive / IF NOT EXISTS — safe to re-run.

alter table campaign_crm_entries add column if not exists draft_subject text;
alter table campaign_crm_entries add column if not exists draft_body    text;
alter table campaign_crm_entries add column if not exists wave          int;
alter table campaign_crm_entries add column if not exists sent_at       timestamptz;
alter table campaign_crm_entries add column if not exists resend_id     text;
alter table campaign_crm_entries add column if not exists message_id    text;
alter table campaign_crm_entries add column if not exists send_error    text;

-- The sender scans for queued entries that already have a draft, oldest first.
create index if not exists campaign_crm_entries_sendable_idx
  on campaign_crm_entries (outreach_campaign_id, stage, created_at)
  where stage = 'queued';

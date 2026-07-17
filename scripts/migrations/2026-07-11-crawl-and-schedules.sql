-- Chrome-extension crawl queue + campaign scheduled sends.
--
-- Two orthogonal features that both hang off outreach_campaigns:
--
-- 1. outreach_crawl_queue: T1 members with a LinkedIn URL get pushed into
--    this queue. The Anker Chrome extension polls, opens each URL in a
--    tab, captures HTML, calls back with the profile payload → lands in
--    crm_entries via existing /api/extension/ingest.
--
-- 2. outreach_campaign_schedules: scheduled campaign actions (initial
--    send, opener nudge, retry). A Vercel cron endpoint scans every 10
--    minutes and executes anything due.

-- ─── outreach_crawl_queue ───────────────────────────────────────────────
create table if not exists outreach_crawl_queue (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  campaign_id   text not null references outreach_campaigns(id) on delete cascade,
  member_id     text references outreach_campaign_members(id) on delete cascade,
  linkedin_url  text not null,
  status        text not null default 'queued'
                  check (status in ('queued','claimed','done','failed','skipped')),
  requested_at  timestamptz not null default now(),
  claimed_at    timestamptz,
  completed_at  timestamptz,
  failed_reason text,
  requested_by  text,        -- user who enqueued
  claimed_by    text,        -- extension client id or user id
  crm_entry_id  text,        -- populated on done: the crm_entries row created / updated
  unique (campaign_id, member_id)
);

create index if not exists outreach_crawl_queue_status_idx
  on outreach_crawl_queue (status, requested_at);
create index if not exists outreach_crawl_queue_user_status_idx
  on outreach_crawl_queue (user_id, status);
create index if not exists outreach_crawl_queue_campaign_idx
  on outreach_crawl_queue (campaign_id);

-- ─── outreach_campaign_schedules ────────────────────────────────────────
create table if not exists outreach_campaign_schedules (
  id             text primary key default gen_random_uuid()::text,
  user_id        text not null,
  campaign_id    text not null references outreach_campaigns(id) on delete cascade,
  -- Action to run when scheduled_at is reached.
  --   send_batch          — send all currently drafted-but-not-sent outreach_messages
  --   send_openers_nudge  — draft + send a nudge to opened-but-not-replied recipients
  --   send_bounces_retry  — re-try sends that soft-bounced last round
  action_type    text not null
                   check (action_type in ('send_batch','send_openers_nudge','send_bounces_retry')),
  scheduled_at   timestamptz not null,
  filter_config  jsonb not null default '{}'::jsonb,
  status         text not null default 'pending'
                   check (status in ('pending','running','done','failed','cancelled')),
  executed_at    timestamptz,
  result_summary jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists outreach_campaign_schedules_due_idx
  on outreach_campaign_schedules (scheduled_at, status)
  where status = 'pending';
create index if not exists outreach_campaign_schedules_campaign_idx
  on outreach_campaign_schedules (campaign_id, status);

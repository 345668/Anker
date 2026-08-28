-- LinkedOut — multi-sender rotation.
--
-- A campaign can send from a POOL of senders instead of one. Each member is
-- assigned a single sender (sticky, for a coherent per-person sequence); the
-- sequencer picks the least-loaded eligible sender at the member's first action.
--
-- Backwards-compatible: li_campaigns.sender_id stays as the default/fallback
-- pool of one when no li_campaign_senders rows exist.

-- ─── li_campaign_senders (the pool) ─────────────────────────────────────
create table if not exists li_campaign_senders (
  id           text primary key default gen_random_uuid()::text,
  campaign_id  text not null references li_campaigns(id) on delete cascade,
  sender_id    text not null references linkedin_senders(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (campaign_id, sender_id)
);

create index if not exists li_campaign_senders_campaign_idx
  on li_campaign_senders (campaign_id);

-- ─── member → assigned sender ───────────────────────────────────────────
alter table li_campaign_members
  add column if not exists sender_id text references linkedin_senders(id) on delete set null;

create index if not exists li_campaign_members_sender_idx
  on li_campaign_members (sender_id) where sender_id is not null;

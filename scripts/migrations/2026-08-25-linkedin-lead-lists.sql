-- LinkedIn outreach automation — Phase 4 (leads / lists).
--
-- Reusable audiences. Build a list from a CSV/paste, or import from the
-- connections + search results the extension already captures into
-- linkedin_connections, then drop the whole list into a campaign (bulk-enroll
-- as li_campaign_members).

-- ─── li_lead_lists ──────────────────────────────────────────────────────
create table if not exists li_lead_lists (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null,
  name        text not null,
  -- Where the list was seeded from (informational).
  source      text not null default 'manual'
                check (source in ('manual','csv','connections','search','extension')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists li_lead_lists_user_idx on li_lead_lists (user_id, created_at desc);

-- ─── li_lead_list_members ───────────────────────────────────────────────
create table if not exists li_lead_list_members (
  id            text primary key default gen_random_uuid()::text,
  list_id       text not null references li_lead_lists(id) on delete cascade,
  user_id       text not null,
  target_url    text not null,
  target_name   text,
  headline      text,
  company       text,
  crm_entry_id  text,
  created_at    timestamptz not null default now(),
  unique (list_id, target_url)
);

create index if not exists li_lead_list_members_list_idx
  on li_lead_list_members (list_id, created_at desc);

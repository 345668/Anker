-- Admin-adjustable campaign engine settings + per-submission send approval, so
-- the admin controls the readiness cutoff and can gate outreach (nothing sends
-- until released when auto-send is off). Additive / IF NOT EXISTS.

-- Single-row settings blob (id is pinned to 1).
create table if not exists campaign_settings (
  id         int primary key default 1,
  data       jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint campaign_settings_singleton check (id = 1)
);
insert into campaign_settings (id, data) values (1, '{}'::jsonb)
  on conflict (id) do nothing;

-- When auto-send is off, a campaign waits at campaign_ready until an admin
-- releases it. Default true preserves existing (fully-automatic) behavior.
alter table founder_submissions
  add column if not exists send_approved boolean not null default true;

-- CRM powerhouse: tasks & reminders, saved views, tags.
--
-- crm_entries.id / user_id are TEXT (like funds.id) — never cast to ::uuid.

alter table crm_entries add column if not exists tags text[] not null default '{}';

create table if not exists crm_tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  crm_entry_id  text references crm_entries(id) on delete cascade,
  title         text not null,
  due_at        timestamptz,
  done_at       timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists crm_tasks_user_open_idx
  on crm_tasks (user_id, due_at asc nulls last) where done_at is null;
create index if not exists crm_tasks_entry_idx on crm_tasks (crm_entry_id);

create table if not exists crm_saved_views (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  name        text not null,
  filters     jsonb not null default '{}'::jsonb,
  position    int,
  created_at  timestamptz not null default now()
);

create index if not exists crm_saved_views_user_idx on crm_saved_views (user_id);

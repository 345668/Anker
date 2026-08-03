-- ANKER AI chat history. One row per saved conversation, per user. The app
-- keeps at most 10 per user (oldest auto-deleted on save). Additive / IF NOT
-- EXISTS.
create table if not exists anker_chats (
  id         text primary key default gen_random_uuid()::text,
  user_id    text not null,
  title      text not null default 'New chat',
  model      text,
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- List a user's chats newest-first; also the ordering used to prune to 10.
create index if not exists anker_chats_user_idx
  on anker_chats (user_id, updated_at desc);

-- LinkedIn outreach automation — Phase 3 (the Unibox).
--
-- A unified inbox for LinkedIn conversations synced by the extension. Beyond
-- the inbox UI, inbound messages give the sequencer its first real signal:
-- when a campaign member replies, their sequence stops (li_campaign_members
-- goes to 'replied') so we never keep messaging someone who answered.

-- ─── li_conversations ───────────────────────────────────────────────────
create table if not exists li_conversations (
  id                text primary key default gen_random_uuid()::text,
  user_id           text not null,
  sender_id         text references linkedin_senders(id) on delete set null,
  -- LinkedIn's stable thread id (urn). Unique per user so re-syncs upsert.
  thread_urn        text,
  participant_url   text,
  participant_name  text,
  -- Optional linkage back to a campaign/member when we can match the participant.
  campaign_id       text,
  member_id         text references li_campaign_members(id) on delete set null,
  last_message_at   timestamptz,
  last_message_text text,
  -- Direction of the most recent message — 'inbound' means they wrote last.
  last_direction    text check (last_direction in ('inbound','outbound')),
  unread            boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, thread_urn)
);

create index if not exists li_conversations_user_idx
  on li_conversations (user_id, last_message_at desc);
create index if not exists li_conversations_member_idx
  on li_conversations (member_id) where member_id is not null;

-- ─── li_messages ────────────────────────────────────────────────────────
create table if not exists li_messages (
  id               text primary key default gen_random_uuid()::text,
  conversation_id  text not null references li_conversations(id) on delete cascade,
  user_id          text not null,
  direction        text not null check (direction in ('inbound','outbound')),
  body             text not null default '',
  sent_at          timestamptz,
  -- LinkedIn message urn when available; lets re-syncs dedupe instead of dup.
  external_id      text,
  created_at       timestamptz not null default now(),
  unique (conversation_id, external_id)
);

create index if not exists li_messages_conversation_idx
  on li_messages (conversation_id, sent_at);

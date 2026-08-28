-- LinkedIn outreach automation — Phase 1 (the autonomous core).
--
-- Two tables that back the extension-driven, approval-gated action pipeline
-- (see docs/scope-linkedin-outreach.md):
--
--   1. linkedin_senders   — a connected LinkedIn account the user sends as.
--      Carries per-account safety limits (daily caps, working hours, warmup)
--      and a status the engine honours.
--
--   2. li_action_queue    — outbound actions (connect / message / follow-up …).
--      Every row is BORN 'pending_approval'. Only a human approval flips it to
--      'queued', and the extension's claim query selects ONLY 'queued' rows —
--      so approval is a hard gate the extension can never bypass (§4a).
--
-- The platform never touches LinkedIn and never stores li_at: the extension
-- executes 'queued' actions in the member's own browser and reports back.

-- ─── linkedin_senders ───────────────────────────────────────────────────
create table if not exists linkedin_senders (
  id             text primary key default gen_random_uuid()::text,
  user_id        text not null,
  -- Identity of the LinkedIn account (captured from the extension's whoami /
  -- the profile the member is logged in as). member_urn is the stable key when
  -- we have it; linkedin_url / display_name are the human-facing labels.
  display_name   text not null,
  linkedin_url   text,
  member_urn     text,
  avatar_url     text,
  status         text not null default 'active'
                   check (status in ('active','paused','restricted','warming')),
  -- Per-account safety limits (conservative defaults; tuned against real
  -- friction over time). Working hours are local to the sender's timezone.
  daily_connect_cap  integer not null default 20,
  daily_message_cap  integer not null default 40,
  working_hours_start smallint not null default 8   check (working_hours_start between 0 and 23),
  working_hours_end   smallint not null default 18  check (working_hours_end   between 1 and 24),
  timezone       text not null default 'UTC',
  -- Warmup: day 0 = brand new; the sequencer ramps caps up over the first
  -- couple of weeks. NULL warmup_started_at means "not warming / fully warm".
  warmup_started_at timestamptz,
  last_action_at timestamptz,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists linkedin_senders_user_idx
  on linkedin_senders (user_id, status);
create unique index if not exists linkedin_senders_user_urn_uidx
  on linkedin_senders (user_id, member_urn) where member_urn is not null;

-- ─── li_action_queue ────────────────────────────────────────────────────
create table if not exists li_action_queue (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  sender_id     text references linkedin_senders(id) on delete set null,
  -- Optional linkage back to a campaign/member/CRM person (Phase 2+ populates
  -- campaign_id/member_id; Phase 1 can enqueue standalone actions for a person).
  campaign_id   text,
  member_id     text,
  crm_entry_id  text,
  -- Who/what this action targets on LinkedIn.
  target_name   text,
  target_url    text not null,
  action_type   text not null
                  check (action_type in ('connect_request','message','follow_up','view_profile','withdraw')),
  -- Action-specific data (e.g. { "message": "..." } for connect notes / DMs).
  payload       jsonb not null default '{}'::jsonb,
  -- Lifecycle. Born 'pending_approval'; approval → 'queued' (the ONLY state the
  -- extension may claim); claim → 'claimed'; report → 'done' | 'failed'.
  -- 'rejected' / 'skipped' are terminal non-sends.
  status        text not null default 'pending_approval'
                  check (status in ('pending_approval','queued','claimed','done','failed','skipped','rejected')),
  -- Approval audit (§4a). Set when a human (or a full-auto campaign) approves.
  approved_by   text,
  approved_at   timestamptz,
  -- Scheduling + execution bookkeeping.
  scheduled_for timestamptz,          -- earliest the action may run (n8n/Phase 2)
  attempts      integer not null default 0,
  claimed_at    timestamptz,
  claimed_by    text,                 -- extension client id / user id
  completed_at  timestamptz,
  failed_reason text,
  result        jsonb,                -- structured report from the extension
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The extension's claim query filters on (user_id, status='queued') ordered by
-- schedule/creation — index it. scheduled_for NULLS FIRST so unscheduled
-- (send-asap) actions sort ahead of future-dated ones.
create index if not exists li_action_queue_claim_idx
  on li_action_queue (user_id, status, scheduled_for, created_at);
create index if not exists li_action_queue_sender_idx
  on li_action_queue (sender_id, status);
create index if not exists li_action_queue_campaign_idx
  on li_action_queue (campaign_id) where campaign_id is not null;
-- Daily per-sender usage (cap enforcement) counts done rows by completed_at.
create index if not exists li_action_queue_sender_done_idx
  on li_action_queue (sender_id, action_type, completed_at)
  where status = 'done';

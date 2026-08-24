-- LinkedIn outreach automation — Phase 2 (the sequencer).
--
-- Campaigns turn single actions (Phase 1) into multi-step sequences
-- (connect → wait → message → wait → follow-up). The sequence STATE lives here;
-- the timing/branching is driven by n8n ticking the server-side engine
-- (lib/linkedin/sequencer.ts via /api/orchestration/sequence/tick), which
-- enqueues each due step into li_action_queue — still behind the approval gate
-- unless the campaign is full-auto.

-- ─── li_campaigns ───────────────────────────────────────────────────────
create table if not exists li_campaigns (
  id           text primary key default gen_random_uuid()::text,
  user_id      text not null,
  name         text not null,
  status       text not null default 'draft'
                 check (status in ('draft','active','paused','archived')),
  -- The sender this campaign sends as (Phase 2 = one sender per campaign;
  -- multi-sender rotation is a later enhancement).
  sender_id    text references linkedin_senders(id) on delete set null,
  -- full_auto: steps are auto-approved on enqueue (skip the human gate). Off by
  -- default — turning it on is an explicit, logged choice (§4a).
  full_auto    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists li_campaigns_user_idx on li_campaigns (user_id, status);

-- ─── li_campaign_steps ──────────────────────────────────────────────────
-- An ordered sequence. Each step waits `delay_hours` after the PREVIOUS step
-- completed, then (if its condition holds) enqueues an action of `action_type`.
create table if not exists li_campaign_steps (
  id           text primary key default gen_random_uuid()::text,
  campaign_id  text not null references li_campaigns(id) on delete cascade,
  step_order   integer not null,          -- 0-based position in the sequence
  action_type  text not null
                 check (action_type in ('connect_request','message','follow_up')),
  -- Message/connect-note body. Supports {{firstName}} / {{name}} tokens.
  template     text not null default '',
  delay_hours  integer not null default 0 check (delay_hours >= 0),
  -- Gate for whether this step runs. 'any' always; the others need Phase 3
  -- signals (acceptance/reply) and are treated conservatively until then.
  condition    text not null default 'any'
                 check (condition in ('any','if_accepted','if_no_reply')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (campaign_id, step_order)
);

create index if not exists li_campaign_steps_campaign_idx
  on li_campaign_steps (campaign_id, step_order);

-- ─── li_campaign_members ────────────────────────────────────────────────
-- A person enrolled in a campaign, plus their position in the sequence.
--
-- State machine (advanced by the sequencer):
--   current_step = index of the step being worked on now.
--   last_action_id = the li_action_queue row for current_step (NULL until enqueued).
--   On enqueue → set last_action_id. On that action reaching 'done' → advance
--   current_step, stamp last_action_at, clear last_action_id. 'failed' → stop.
create table if not exists li_campaign_members (
  id             text primary key default gen_random_uuid()::text,
  campaign_id    text not null references li_campaigns(id) on delete cascade,
  user_id        text not null,
  crm_entry_id   text,
  target_url     text not null,
  target_name    text,
  current_step   integer not null default 0,
  last_action_id text references li_action_queue(id) on delete set null,
  last_action_at timestamptz,             -- when the previous step completed
  state          text not null default 'active'
                   check (state in ('active','completed','stopped','replied')),
  stopped_reason text,
  enrolled_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (campaign_id, target_url)
);

create index if not exists li_campaign_members_campaign_idx
  on li_campaign_members (campaign_id, state);
create index if not exists li_campaign_members_due_idx
  on li_campaign_members (campaign_id, state, last_action_at);

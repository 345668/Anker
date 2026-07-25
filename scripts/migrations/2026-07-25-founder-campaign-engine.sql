-- Founder Campaign Engine — public submission → batched assessment →
-- dimensional matching → progressive outreach → per-campaign CRM →
-- founder/investor notification loop.
--
-- See CAMPAIGN_ENGINE_PLAN.md. Additive / IF NOT EXISTS throughout; safe to
-- re-run. IDs are TEXT gen_random_uuid()::text to match outreach_campaigns et al.
-- Investor interest links reuse the LP-portal token discipline: the plaintext
-- token is shown once and only its SHA-256 hash is stored.

-- ─── founder_submissions ─────────────────────────────────────────────────────
-- One row per public application. `status` is the pipeline spine:
--   received → assessing → assessed → campaign_ready → outreaching → completed
--                                  └→ declined (terminal, feedback emailed)
--   (any) → failed (retryable)
create table if not exists founder_submissions (
  id                  text primary key default gen_random_uuid()::text,
  public_ref          text not null unique,        -- short human code, e.g. ANK-8F3K
  campaign_batch_id   text,                         -- which marketing wave/batch

  -- Company
  startup_name        text not null,
  website             text,
  one_liner           text,
  sectors             text[] not null default '{}',
  stage               text,
  raise_amount        numeric,
  check_size_min      numeric,
  check_size_max      numeric,
  location            text,

  -- Founder / team
  founder_name        text not null,
  founder_email       text not null,
  founder_linkedin    text,
  founder_title       text,
  team_json           jsonb not null default '[]'::jsonb,

  -- Everything else captured from the form / extraction
  traction_json       jsonb not null default '{}'::jsonb,
  extra_fields_json   jsonb not null default '{}'::jsonb,

  -- Uploaded materials (Vercel Blob keys, private store)
  deck_blob_key       text,
  data_room_keys      text[] not null default '{}',

  -- Pipeline
  status              text not null default 'received'
                        check (status in ('received','assessing','assessed',
                          'declined','campaign_ready','outreaching','completed','failed')),
  assessment_score    int,
  assessment_json     jsonb,
  decline_reason      text,
  startup_profile_id  text,                         -- matching-engine profile id
  outreach_campaign_id text references outreach_campaigns(id) on delete set null,

  -- Abuse / provenance
  ip_hash             text,
  user_agent          text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists founder_submissions_status_idx
  on founder_submissions (status, created_at);
create index if not exists founder_submissions_email_idx
  on founder_submissions (lower(founder_email), created_at desc);
create index if not exists founder_submissions_campaign_idx
  on founder_submissions (outreach_campaign_id)
  where outreach_campaign_id is not null;

-- ─── submission_assessment_jobs ──────────────────────────────────────────────
-- Idempotent, resumable per-phase job log so a timeout / redeploy mid-batch
-- never double-processes or loses a submission.
create table if not exists submission_assessment_jobs (
  id                text primary key default gen_random_uuid()::text,
  submission_id     text not null references founder_submissions(id) on delete cascade,
  phase             text not null
                      check (phase in ('extract','readiness','match','draft','done')),
  status            text not null default 'pending'
                      check (status in ('pending','running','done','failed')),
  attempts          int not null default 0,
  batch_provider_id text,                            -- e.g. Anthropic Message Batch id
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- At most one live job per (submission, phase); lets the cron upsert safely.
create unique index if not exists submission_assessment_jobs_uniq
  on submission_assessment_jobs (submission_id, phase);
create index if not exists submission_assessment_jobs_due_idx
  on submission_assessment_jobs (status, updated_at)
  where status in ('pending','running');

-- ─── campaign_crm_entries ────────────────────────────────────────────────────
-- Per-campaign exclusive investor tracker: every investor contacted for this
-- founder's campaign, with stage + interest. Vocabulary mirrors crm_entries so
-- match_outcome_events keeps working via recordStageTransition().
create table if not exists campaign_crm_entries (
  id                  text primary key default gen_random_uuid()::text,
  outreach_campaign_id text not null references outreach_campaigns(id) on delete cascade,
  submission_id       text not null references founder_submissions(id) on delete cascade,

  investor_id         text,
  firm_id             text,
  investor_email      text,
  investor_name       text,

  match_score         int,
  match_rationale     text,

  stage               text not null default 'queued'
                        check (stage in ('queued','contacted','opened','interested',
                          'not_interested','meeting','passed')),
  contacted_at        timestamptz,
  opened_at           timestamptz,
  responded_at        timestamptz,

  interest_choice     text check (interest_choice in ('yes','no')),
  interest_at         timestamptz,
  founder_notified_at timestamptz,

  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists campaign_crm_entries_campaign_idx
  on campaign_crm_entries (outreach_campaign_id, stage);
create index if not exists campaign_crm_entries_submission_idx
  on campaign_crm_entries (submission_id);
-- Don't contact the same investor twice within one campaign.
create unique index if not exists campaign_crm_entries_uniq_investor
  on campaign_crm_entries (outreach_campaign_id, investor_id)
  where investor_id is not null;

-- ─── campaign_interest_tokens ────────────────────────────────────────────────
-- One-click Interested / Not-interested links in investor emails. Plaintext
-- token emailed once; only the SHA-256 hash stored (LP-portal pattern).
create table if not exists campaign_interest_tokens (
  token_hash            text primary key,           -- sha-256 hex of the plaintext
  campaign_crm_entry_id text not null references campaign_crm_entries(id) on delete cascade,
  choice_locked         boolean not null default false,
  expires_at            timestamptz,
  used_at               timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists campaign_interest_tokens_entry_idx
  on campaign_interest_tokens (campaign_crm_entry_id);

-- ─── founder_notifications ───────────────────────────────────────────────────
-- Founder-facing notification feed (in-app + email fan-out log).
create table if not exists founder_notifications (
  id            text primary key default gen_random_uuid()::text,
  submission_id text not null references founder_submissions(id) on delete cascade,
  type          text not null
                  check (type in ('interest','reply','milestone','complete')),
  payload_json  jsonb not null default '{}'::jsonb,
  emailed_at    timestamptz,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists founder_notifications_submission_idx
  on founder_notifications (submission_id, created_at desc);

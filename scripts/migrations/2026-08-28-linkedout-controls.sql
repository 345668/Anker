-- LinkedOut — campaign controls & safety:
--   1. compliance / opt-out (do-not-contact list)
--   2. approval auto-rules (per-action-type auto-approve)
--   3. A/B message variants

-- ─── 1. suppression list (do-not-contact) ───────────────────────────────
create table if not exists li_suppressions (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null,
  -- Normalized /in/<slug> key (case-insensitive) for matching.
  slug        text not null,
  target_url  text,
  reason      text,           -- 'manual' | 'opt_out' | …
  created_at  timestamptz not null default now(),
  unique (user_id, slug)
);
create index if not exists li_suppressions_user_idx on li_suppressions (user_id);

-- ─── 2. approval auto-rules (granular; complements full_auto) ────────────
alter table li_campaigns
  add column if not exists auto_approve_connects boolean not null default false,
  add column if not exists auto_approve_messages boolean not null default false;

-- ─── 3. A/B variants: alternate templates per step ──────────────────────
-- variants is a jsonb array of template strings; when non-empty the sequencer
-- rotates them across members (sticky per member) instead of using `template`.
alter table li_campaign_steps
  add column if not exists variants jsonb not null default '[]'::jsonb;

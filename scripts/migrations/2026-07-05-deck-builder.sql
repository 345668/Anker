-- Deck builder — Figma-first templates with AI-fill.
--
-- Two tables:
--   deck_templates  : catalog of Figma community + workspace templates.
--                     Deck type is initially "unclassified"; the user
--                     classifies each one when they promote it.
--                     Node mapping (Figma text/image node id -> Anker
--                     field key) is cached here so the second use of a
--                     template is deterministic and free.
--   decks           : concrete decks a user has started building.
--                     Points at a template + a fund + the user's own
--                     duplicated Figma file (needed because we can't
--                     write into community files).

create table if not exists deck_templates (
  id             uuid primary key default gen_random_uuid(),
  file_key       text not null unique,            -- Figma community file key
  source         text not null default 'community' check (source in ('community','workspace','custom')),
  name           text,                             -- Human-readable, editable
  deck_type      text not null default 'unclassified' check (deck_type in (
                    'unclassified','fund_overview','lp_update','pitch_deck',
                    'investment_memo','portfolio_review','other'
                 )),
  shortlisted    boolean not null default false,   -- User pinned this one
  favorite       boolean not null default false,   -- User's very best pick per deck type
  thumbnail_url  text,                             -- Filled lazily (og:image)
  community_url  text not null,
  node_mapping   jsonb,                            -- Set once approved; keyed by node id
  mapping_ready  boolean not null default false,
  created_at     timestamptz not null default now(),
  classified_at  timestamptz,
  classified_by  text,
  notes          text
);

create index if not exists deck_templates_type_idx      on deck_templates (deck_type);
create index if not exists deck_templates_shortlist_idx on deck_templates (shortlisted) where shortlisted = true;
create index if not exists deck_templates_favorite_idx  on deck_templates (favorite)    where favorite    = true;

create table if not exists decks (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null,
  template_id           uuid not null references deck_templates(id) on delete restrict,
  fund_id               uuid,                              -- Nullable — pitch decks may not be fund-scoped
  target_id             uuid,                              -- For pitch decks / memos: the target company id
  workspace_file_key    text,                              -- The user's own copy of the file, once duplicated
  workspace_file_url    text,
  status                text not null default 'draft' check (status in (
                          'draft','mapping','filled','exported','archived'
                        )),
  values                jsonb not null default '{}'::jsonb, -- Field values user + AI approved
  ai_generated_fields   jsonb not null default '{}'::jsonb, -- Which fields Qwen wrote (for the audit trail)
  last_filled_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists decks_owner_idx   on decks (owner_id, created_at desc);
create index if not exists decks_template_idx on decks (template_id);
create index if not exists decks_fund_idx    on decks (fund_id) where fund_id is not null;

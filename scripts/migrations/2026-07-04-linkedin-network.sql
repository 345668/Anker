-- LinkedIn network graph capture.
--
-- Populated by the Anker LinkedIn extension:
--   - linkedin_connections: a person captured from your network (1st-degree
--     "Sync connections", a search result, or a profile you viewed). Merged
--     with `contacts` at read time (matched by normalized linkedin_url) to
--     decide whether a node is "warm" (already in the CRM).
--   - linkedin_mutuals: "you and X both know Y" edges scraped from a profile's
--     mutual-connections widget. These power the 2nd/3rd-degree web and the
--     "intro path" suggestions in the in-app relationship graph.
--
-- Everything is scoped by owner_id (== Supabase auth user id == contacts.owner_id
-- == extension_tokens.user_id). URLs are stored normalized (lowercased, no
-- query/hash, no trailing slash) so joins against contacts.linkedin_url work.

create table if not exists linkedin_connections (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null,
  linkedin_url  text not null,                 -- normalized
  full_name     text not null,
  headline      text,
  company       text,
  title         text,
  location      text,
  image_url     text,
  degree        smallint not null default 1,   -- 1 | 2 | 3 (network distance)
  connected_at  timestamptz,                   -- when you connected, if known
  raw           jsonb,                          -- full scraped card for future use
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, linkedin_url)
);

create index if not exists linkedin_connections_owner_idx
  on linkedin_connections (owner_id);
create index if not exists linkedin_connections_owner_company_idx
  on linkedin_connections (owner_id, company);
create index if not exists linkedin_connections_owner_degree_idx
  on linkedin_connections (owner_id, degree);

create table if not exists linkedin_mutuals (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null,
  person_url   text not null,                  -- normalized: the profile you viewed
  mutual_url   text,                            -- normalized: a shared connection (may be null if only a name)
  mutual_name  text not null,
  captured_at  timestamptz not null default now(),
  unique (owner_id, person_url, mutual_name)
);

create index if not exists linkedin_mutuals_owner_person_idx
  on linkedin_mutuals (owner_id, person_url);
create index if not exists linkedin_mutuals_owner_mutual_idx
  on linkedin_mutuals (owner_id, mutual_url);

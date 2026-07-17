-- LP statement import — paste a capital statement, AI maps the columns into
-- DATED per-LP positions, review, approve.
--
-- Two tables:
--   lp_statement_imports : the review queue. One paste = one import, holding
--                          the as-of date + the extracted positions as JSONB
--                          (each row carries a matched fund_lps id when the
--                          name resolved). status pending|approved|dismissed.
--   lp_positions         : dated position history per LP. Approving an import
--                          writes one row per LP as of that date, so you can
--                          reconstruct a capital account AS OF any date and
--                          the current-state fund_lps row is just the latest.
--
-- Feature adapted from Hemrock Portfolio Reporting (Apache-2.0); see NOTICE.
-- Rebuilt on Anker's Neon `sql` layer (fund_lps.id / fund_id are TEXT).

create table if not exists lp_statement_imports (
  id           uuid primary key default gen_random_uuid(),
  fund_id      text not null,
  as_of        date,
  raw_text     text not null,
  positions    jsonb not null default '[]'::jsonb,   -- [{ lpId?, lpName, commitment, called, distributed, nav }]
  confidence   numeric,
  status       text not null default 'pending'
                 check (status in ('pending','approved','dismissed')),
  notes        text,
  created_by   text,
  reviewed_by  text,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists lp_statement_imports_status_idx
  on lp_statement_imports (fund_id, status, created_at desc);

create table if not exists lp_positions (
  id            uuid primary key default gen_random_uuid(),
  fund_id       text not null,
  lp_id         text references fund_lps(id) on delete set null,
  lp_name       text not null,
  as_of         date not null,
  commitment    numeric,
  called        numeric,
  distributed   numeric,
  nav           numeric,
  source        text not null default 'statement_import',
  import_id     uuid references lp_statement_imports(id) on delete set null,
  created_by    text,
  created_at    timestamptz not null default now(),
  -- one position per LP per as-of date; re-approving overwrites
  unique (fund_id, lp_id, as_of)
);

create index if not exists lp_positions_lp_asof_idx on lp_positions (lp_id, as_of desc);
create index if not exists lp_positions_fund_asof_idx on lp_positions (fund_id, as_of desc);

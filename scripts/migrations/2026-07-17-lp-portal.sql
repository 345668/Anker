-- LP Portal — magic-link access for limited partners.
--
-- Each LP gets a long random token (emailed as a portal link). Only the
-- SHA-256 hash is stored. Visiting /portal/<token> resolves the LP, then
-- serves ONLY that LP's materials: their capital position history
-- (lp_positions), published quarterly letters (lp_quarterly_reports), and
-- fund documents (lp_reports). No LP password / Supabase account.
--
-- Feature adapted from Hemrock Portfolio Reporting (Apache-2.0); see NOTICE.

create table if not exists lp_portal_tokens (
  id           uuid primary key default gen_random_uuid(),
  lp_id        text not null references fund_lps(id) on delete cascade,
  fund_id      text not null,
  token_hash   text not null unique,        -- sha-256 hex of the plaintext token
  prefix       text not null,               -- first chars, for display in the admin list
  label        text,                        -- optional note ("Q2 send")
  expires_at   timestamptz,                 -- null = no expiry
  revoked      boolean not null default false,
  last_seen_at timestamptz,
  view_count   int not null default 0,
  created_by   text,
  created_at   timestamptz not null default now()
);

create index if not exists lp_portal_tokens_lp_idx on lp_portal_tokens (lp_id) where revoked = false;

-- Lightweight access log — who viewed what, when (for the GP + the LP's trust).
create table if not exists lp_portal_access_log (
  id         uuid primary key default gen_random_uuid(),
  token_id   uuid references lp_portal_tokens(id) on delete set null,
  lp_id      text,
  path       text,
  ip         text,
  at         timestamptz not null default now()
);

create index if not exists lp_portal_access_log_lp_idx on lp_portal_access_log (lp_id, at desc);

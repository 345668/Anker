-- Portfolio KPI update ingestion — the review queue behind AI extraction.
--
-- An investor update (pasted email text, or a future inbound webhook) is
-- run through the AI extractor, which identifies the portfolio company and
-- pulls a month's KPIs. The result lands here as a PENDING extraction. A GP
-- reviews / edits the numbers, then APPROVES → the values upsert into
-- portfolio_kpis_monthly (source = 'email_update'). Dismissed extractions
-- are kept for audit.
--
-- Feature ported (adapted) from Hemrock Portfolio Reporting (Apache-2.0);
-- see NOTICE. Rebuilt on Anker's Neon `sql` layer — no Supabase/RLS.

create table if not exists portfolio_kpi_extractions (
  id              uuid primary key default gen_random_uuid(),
  fund_id         text,                         -- funds.id (slug/uuid text)
  company_id      text references portfolio_companies(id) on delete set null,  -- portfolio_companies.id is TEXT
  -- What the AI matched to, before/without a confirmed company row:
  matched_name    text,                          -- company name the AI read
  month_end       date,                          -- reporting month (last day)
  -- Extracted metrics (all nullable — updates rarely carry every field):
  cash_balance      numeric,
  monthly_burn      numeric,
  runway_months     numeric,
  monthly_revenue   numeric,
  revenue_growth_mom numeric,
  gross_margin_pct  numeric,
  headcount         int,
  customers         int,
  arr               numeric,
  highlights        text,                         -- qualitative narrative pulled from the update
  -- Provenance + review state:
  raw_text          text not null,                -- the source update text
  source            text not null default 'email_update',
  confidence        numeric,                       -- 0..1 self-reported by the model
  status            text not null default 'pending'
                      check (status in ('pending','approved','dismissed')),
  notes             text,                          -- reviewer notes
  created_by        text,
  reviewed_by       text,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists kpi_extractions_status_idx
  on portfolio_kpi_extractions (status, created_at desc);
create index if not exists kpi_extractions_company_idx
  on portfolio_kpi_extractions (company_id);

-- Widen the KPI source vocabulary if the column has a CHECK; portfolio_kpis_monthly.source
-- is free-text in Anker, so no constraint change needed — 'email_update' just works.

-- ============================================================================
-- Portfolio tracker — venture-studio P0
-- ============================================================================
--
-- A venture-studio fund's job changes the day it makes its first investment:
-- from "find good deals" to "operate the portfolio."  This migration adds
-- the two tables that make Anker the operating layer for that work.
--
--   portfolio_companies        ── one row per investment (incubation, seed,
--                                 follow-on, secondary). Fund-aware so SVS
--                                 Fund I, Fund II, and any future SPV can
--                                 share the same table without cross-talk.
--
--   portfolio_kpis_monthly     ── one row per company per month with the
--                                 metrics LPs ask for in quarterly letters:
--                                 cash, runway, revenue, gross margin,
--                                 headcount, MoM growth, customer count.
--                                 Designed for time-series queries
--                                 (`WHERE company_id = … ORDER BY month_end`)
--                                 not snapshot lookups, so we index by
--                                 (company_id, month_end DESC).
--
-- This deliberately leaves OUT (will live in their own tables when we get
-- to them):
--   - SPV ledger / cap table per portco       → portfolio_spvs (P1)
--   - LP quarterly reports                    → lp_reports (P0 next step)
--   - Distribution waterfall                  → fund_distributions (P1)
--   - Capital calls                           → capital_calls (P0 next step)
--
-- Multi-tenancy
-- ─────────────
-- We attach companies to fund_id (TEXT, not FK yet — funds table doesn't
-- exist) and a soft owner_user_id (Supabase auth uuid) so a fund manager
-- can only see their own fund's portfolio. The /api/portfolio/* routes
-- enforce this; the schema doesn't (no RLS yet).
--
-- Indexing strategy
-- ─────────────────
--   - Companies: (fund_id, status) for the dashboard's filtered list view.
--   - KPIs:      (company_id, month_end DESC) for "latest snapshot first"
--                queries, plus a UNIQUE on (company_id, month_end) so we
--                can UPSERT a single month without checking first.
-- ============================================================================

CREATE TABLE IF NOT EXISTS portfolio_companies (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  /** Which fund / SPV owns this position. We don't have a `funds` table yet
   *  so this is a plain TEXT slug ("svs-fund-i", "svs-fund-ii"). When the
   *  funds table lands we'll add a FK and backfill. */
  fund_id         TEXT        NOT NULL DEFAULT 'svs-fund-ii',

  /** The portco itself. */
  name            TEXT        NOT NULL,
  /** URL-safe identifier, mirrors lib/newsroom/slug.ts pattern.
   *  Used in /dashboard/portfolio/<slug>. */
  slug            TEXT        NOT NULL,
  website         TEXT,
  linkedin_url    TEXT,
  one_liner       TEXT,
  description     TEXT,
  sector          TEXT,        -- e.g. "fintech", "ai-infra"
  sub_sector      TEXT,        -- e.g. "embedded-payments"
  geography       TEXT,        -- e.g. "MENA", "SEA", "Global"
  stage           TEXT,        -- "incubation", "pre-seed", "seed", "series-a", "series-b+", "growth"
  founded_year    INT,

  /** Investment economics — all per-position, not per-round.
   *  When we add follow-ons / SPVs we'll move this to portfolio_positions. */
  first_check_at  DATE,
  first_check_amount       NUMERIC(14, 2),  -- USD
  total_invested_amount    NUMERIC(14, 2),  -- across all rounds
  ownership_pct            NUMERIC(6, 4),   -- fully-diluted, current
  last_round_at            DATE,
  last_round_name          TEXT,            -- "Seed", "Series A", "Bridge"
  last_round_valuation     NUMERIC(14, 2),  -- post-money, USD

  /** Operating status, drives the dashboard chips.
   *   active        — operating, in-portfolio
   *   exited        — full exit / acquisition / IPO
   *   written_off   — full write-off
   *   on_watch      — flagged, manual review needed */
  status          TEXT        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'exited', 'written_off', 'on_watch')),

  /** Who in the studio owns the relationship. Supabase auth uuid. */
  owner_user_id   TEXT,

  /** Free-form JSON for fields we'll need but haven't yet typed
   *  (board seats, observer rights, ESOP commitments, etc.) */
  metadata        JSONB       DEFAULT '{}'::jsonb,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT portfolio_companies_slug_per_fund_unique UNIQUE (fund_id, slug)
);

CREATE INDEX IF NOT EXISTS portfolio_companies_fund_status_idx
  ON portfolio_companies (fund_id, status);
CREATE INDEX IF NOT EXISTS portfolio_companies_sector_idx
  ON portfolio_companies (sector);
CREATE INDEX IF NOT EXISTS portfolio_companies_stage_idx
  ON portfolio_companies (stage);


CREATE TABLE IF NOT EXISTS portfolio_kpis_monthly (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id      TEXT        NOT NULL REFERENCES portfolio_companies(id) ON DELETE CASCADE,

  /** The month this snapshot is for — always the LAST day of the calendar
   *  month for consistency (2026-06-30, 2026-07-31, …). The UNIQUE constraint
   *  enforces one row per company per month. */
  month_end       DATE        NOT NULL,

  /** Core operating metrics — USD, undeflated, monthly cash basis.
   *  All optional because early-stage founders frequently don't have all of
   *  these yet, and forcing a value would push them to put 0 and corrupt
   *  the trendline. */
  cash_balance         NUMERIC(14, 2),
  monthly_burn         NUMERIC(14, 2),       -- net burn = -(net cash flow)
  runway_months        NUMERIC(6, 1),        -- denormalised; cash / burn rounded to 1dp
  monthly_revenue      NUMERIC(14, 2),
  revenue_growth_mom   NUMERIC(6, 3),        -- 0.18 = +18% MoM
  gross_margin_pct     NUMERIC(6, 3),        -- 0.72 = 72%
  headcount            INT,
  customers            INT,
  arr                  NUMERIC(14, 2),       -- ARR ≠ MRR*12 for usage-based; keep separate

  /** Free-form note from the founder's update. We surface this in the
   *  detail page; LLM summarises across companies when LPs read the
   *  quarterly report. */
  notes                TEXT,

  /** Where this snapshot came from — drives the data-quality badge.
   *   manual        — fund manager typed it in
   *   founder_form  — submitted via a founder portal form (future)
   *   import_xlsx   — bulk upload from a portco's exec dashboard
   *   api           — fetched from Stripe / Brex / etc. (future) */
  source               TEXT        NOT NULL DEFAULT 'manual'
                       CHECK (source IN ('manual', 'founder_form', 'import_xlsx', 'api')),

  created_by           TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT portfolio_kpis_month_unique UNIQUE (company_id, month_end)
);

CREATE INDEX IF NOT EXISTS portfolio_kpis_company_month_idx
  ON portfolio_kpis_monthly (company_id, month_end DESC);

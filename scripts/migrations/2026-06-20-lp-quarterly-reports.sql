-- ============================================================================
-- LP quarterly reports — venture-studio P0 (depends on portfolio tracker)
-- ============================================================================
--
-- One row per (fund, quarter) — what we send to LPs at the end of each
-- quarter.  The portfolio tracker (portfolio_companies + portfolio_kpis_monthly)
-- is the source of truth; this table caches the generated narrative so the
-- LP letter is reproducible — re-opening the report shows the same text
-- the LPs received, not a re-roll against today's KPIs.
--
-- Lifecycle
-- ─────────
--   draft        — auto-generated, fund manager editing
--   reviewed     — internal sign-off done, ready to send
--   sent         — distributed to LPs (we don't actually send from this
--                  table yet; status flips when the manager hits Send)
--   archived     — superseded
--
-- Why cache the KPI snapshot
-- ──────────────────────────
-- portfolio_kpis_monthly rows can be corrected after-the-fact (a founder
-- updates last quarter's burn).  We don't want to silently rewrite history
-- in LP letters that have already gone out.  kpis_snapshot is a frozen
-- jsonb of what the rollup looked like at generation time so the report
-- always reads the same way.
--
-- The narrative is stored as markdown.  Same renderer the newsroom uses
-- (lib/newsroom/markdown.ts → renderArticleHtml) can be reused for the
-- preview screen.  DOCX export goes through lib/ai/docx-export.ts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lp_quarterly_reports (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  fund_id         TEXT        NOT NULL DEFAULT 'svs-fund-ii',

  /** Last day of the quarter the report covers — 2026-03-31, 2026-06-30,
   *  2026-09-30, 2026-12-31. We coerce on insert. */
  quarter_end     DATE        NOT NULL,
  /** Human-readable quarter tag — "2026-Q2" — denormalised so the list
   *  view can render without parsing the date. */
  quarter_label   TEXT        NOT NULL,

  /** Markdown body of the letter. The generator returns ~1500-2500 words
   *  structured as: cover summary, fund-level highlights, portfolio
   *  company sections, fund operations, ask. */
  content_md      TEXT,
  /** One-paragraph executive summary surfaced in the list view +
   *  email preview. Generated alongside content_md. */
  summary         TEXT,

  /** Frozen snapshot of the portfolio + KPI rollup the report was generated
   *  from. Shape: { rollup: PortfolioRollup, companies: [{ id, name, status,
   *  sector, stage, latest_kpi: KpiSnapshot|null, qoq: {...} }, ...] }.
   *  Reproducibility: when an LP asks "where did the $42M invested figure
   *  come from?", we don't have to time-travel the portfolio tables. */
  kpis_snapshot   JSONB       DEFAULT '{}'::jsonb,

  /** Lifecycle. */
  status          TEXT        NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'reviewed', 'sent', 'archived')),
  sent_at         TIMESTAMPTZ,
  reviewed_by     TEXT,        -- user id or email

  /** Generator metadata for debugging / re-generation. */
  generated_by    TEXT,        -- supabase user id
  generator_model TEXT,        -- "qwen-max", "gpt-4", etc.
  generation_ms   INT,         -- wall time for the LLM call

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT lp_quarterly_reports_fund_quarter_unique UNIQUE (fund_id, quarter_end)
);

CREATE INDEX IF NOT EXISTS lp_quarterly_reports_fund_quarter_idx
  ON lp_quarterly_reports (fund_id, quarter_end DESC);
CREATE INDEX IF NOT EXISTS lp_quarterly_reports_status_idx
  ON lp_quarterly_reports (status);

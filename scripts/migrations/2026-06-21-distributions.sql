-- ============================================================================
-- Distributions — capital flowing back to LPs (inverse of capital_calls)
-- ============================================================================
--
-- A distribution is a fund-level event where the GP returns capital to LPs.
-- Same shape as capital_calls (header row + line items per LP), but the
-- semantics flip:
--   - capital_calls.amount  → LP wires money IN  (drives called_amount up)
--   - distributions.amount  → LP receives money (drives distributed_amount up)
--
-- Waterfall handling
-- ──────────────────
-- This MVP keeps the waterfall simple: a single net_amount per distribution,
-- which the GP pre-computed (typically after running their own waterfall
-- model — RoIC, hurdle, catch-up, carried interest). Per-LP allocation is
-- pro-rata against ownership_pct.
--
-- Tracking GP economics
-- ─────────────────────
-- gross_amount, mgmt_fee_deduction, carry_deduction, net_amount let us show
-- LPs WHY the net is what it is in the notice without modelling the full
-- waterfall in the DB. A separate distribution_modeller skill / page can
-- compute these from inputs and stamp the result here. Today the GP types
-- them directly.
--
-- source_company_id
-- ─────────────────
-- Optional FK to portfolio_companies — when a distribution traces to a
-- specific portco exit (Acme Series A secondary, etc), capturing it here
-- lets us roll up per-company DPI later. NULL when the source is fund-level
-- (e.g. excess management fees returned at fund-end).
--
-- Lifecycle (mirrors capital_calls but with one extra terminal state)
--   draft       — line items computed, GP editing
--   notified    — notices emailed to LPs (sent_at set)
--   paid        — all line items wire-confirmed
--   cancelled   — withdrawn before payment
--
-- Per line item
--   pending     — not yet notified
--   notified    — notice email sent
--   paid        — wire sent + confirmed
--   waived      — LP relinquished claim (rare, side letter)
-- ============================================================================

CREATE TABLE IF NOT EXISTS distributions (
  id                       TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  fund_id                  TEXT        NOT NULL REFERENCES funds(id) ON DELETE CASCADE,

  /** Per-fund ordinal "Distribution #5". */
  distribution_number      INT         NOT NULL,
  /** Display title — "Acme Labs — Series A secondary". */
  title                    TEXT        NOT NULL,
  /** Source description — surfaced in notice. */
  source                   TEXT,

  /** Optional source company — when this traces back to a portco event. */
  source_company_id        TEXT        REFERENCES portfolio_companies(id) ON DELETE SET NULL,

  /** Gross proceeds before any fund-level deductions, in fund currency. */
  gross_amount             NUMERIC(14, 2),
  /** Pulled from gross for mgmt fees / fund expenses. */
  mgmt_fee_deduction       NUMERIC(14, 2) DEFAULT 0,
  /** GP carry deduction. */
  carry_deduction          NUMERIC(14, 2) DEFAULT 0,
  /** Distributable to LPs (denormalised from line items + GP inputs). */
  net_amount               NUMERIC(14, 2) DEFAULT 0,

  /** Wire date communicated to LPs. */
  payment_date             DATE,
  /** When notices were emailed. */
  notified_at              TIMESTAMPTZ,

  /** Drafted notice body (markdown) + subject — same pattern as capital_calls. */
  notice_md                TEXT,
  notice_subject           TEXT,

  status                   TEXT        NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'notified', 'paid', 'cancelled')),

  created_by               TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT distributions_fund_number_unique UNIQUE (fund_id, distribution_number)
);

CREATE INDEX IF NOT EXISTS distributions_fund_status_idx
  ON distributions (fund_id, status, distribution_number DESC);
CREATE INDEX IF NOT EXISTS distributions_source_company_idx
  ON distributions (source_company_id);


CREATE TABLE IF NOT EXISTS distribution_line_items (
  id                       TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  distribution_id          TEXT        NOT NULL REFERENCES distributions(id) ON DELETE CASCADE,
  fund_lp_id               TEXT        NOT NULL REFERENCES fund_lps(id) ON DELETE CASCADE,

  /** Per-LP receivable in fund currency. */
  amount                   NUMERIC(14, 2) NOT NULL DEFAULT 0,

  status                   TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'notified', 'paid', 'waived')),

  notified_at              TIMESTAMPTZ,
  paid_at                  TIMESTAMPTZ,
  payment_ref              TEXT,
  resend_message_id        TEXT,

  notes                    TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT distribution_line_items_dist_lp_unique UNIQUE (distribution_id, fund_lp_id)
);

CREATE INDEX IF NOT EXISTS distribution_line_items_dist_status_idx
  ON distribution_line_items (distribution_id, status);
CREATE INDEX IF NOT EXISTS distribution_line_items_lp_idx
  ON distribution_line_items (fund_lp_id);

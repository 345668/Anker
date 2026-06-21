-- ============================================================================
-- Capital calls — third venture-studio P0 piece
-- ============================================================================
--
-- A capital call is a fund's request to its LPs to wire in some fraction of
-- their committed capital.  Two tables:
--
--   capital_calls               — one row per call (one fund-wide event)
--   capital_call_line_items     — one row per (call, LP) — the per-LP demand
--
-- Lifecycle per call:
--   draft     — line items computed, fund manager editing
--   sent      — notices emailed to LPs (sent_at set)
--   settled   — every line item has paid_at set
--   cancelled — call was withdrawn before settlement
--
-- Lifecycle per line item:
--   pending      — LP has not paid
--   sent         — notice emailed to this LP (sent_at set)
--   paid         — wire received (paid_at set + amount denominated in fund ccy)
--   waived       — fund waived this LP's call (e.g. side letter)
--   defaulted    — LP failed to fund within the grace period
--
-- Disbursement triggers
-- ─────────────────────
-- When a line item flips to 'paid', the API increments
-- fund_lps.called_amount by the line item's amount and re-runs status
-- (committed → fully_called when sum(line_items.amount) where status=paid
--  reaches commitment_amount).  The recompute lives in the queries module,
-- not as a SQL trigger, because we want to surface the status flip in the
-- response payload to the UI.
--
-- Why call_number
-- ───────────────
-- LPs and finance teams refer to calls by ordinal: "Call #3, Q2 2026, 15%."
-- A monotonically increasing per-fund counter is the most useful display
-- key; we generate it server-side at create time (current max + 1).
-- ============================================================================

CREATE TABLE IF NOT EXISTS capital_calls (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  fund_id         TEXT        NOT NULL REFERENCES funds(id) ON DELETE CASCADE,

  /** Per-fund ordinal. "Call #3". UNIQUE per fund. */
  call_number     INT         NOT NULL,
  /** Display name — "Q2 2026 — Series A reserves". */
  title           TEXT        NOT NULL,
  /** Why we're calling capital — one short paragraph LPs see in the notice. */
  purpose         TEXT,

  /** Pct of total commitments being called this round (0.15 = 15%).
   *  Used as the default for per-LP line items at draft time. Editable
   *  per-LP for side-letter discounts, scaled commitments, etc. */
  default_call_pct NUMERIC(6, 4),

  /** Sum of all line item amounts in fund currency. Denormalised — kept
   *  in sync by the API after every line-item write. */
  total_amount    NUMERIC(14, 2) DEFAULT 0,

  /** When the call notice was sent to LPs. NULL while draft. */
  sent_at         TIMESTAMPTZ,
  /** Wire deadline communicated to LPs. */
  due_date        DATE,

  /** Notice body (markdown). Auto-drafted by the generator. */
  notice_md       TEXT,
  /** Email subject line for the notice send. */
  notice_subject  TEXT,

  status          TEXT        NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'sent', 'settled', 'cancelled')),

  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT capital_calls_fund_call_number_unique UNIQUE (fund_id, call_number)
);

CREATE INDEX IF NOT EXISTS capital_calls_fund_status_idx
  ON capital_calls (fund_id, status, call_number DESC);


CREATE TABLE IF NOT EXISTS capital_call_line_items (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  call_id         TEXT        NOT NULL REFERENCES capital_calls(id) ON DELETE CASCADE,
  fund_lp_id      TEXT        NOT NULL REFERENCES fund_lps(id) ON DELETE CASCADE,

  /** The demand on this LP — usually default_call_pct × commitment_amount,
   *  but overridable per row. */
  amount          NUMERIC(14, 2) NOT NULL DEFAULT 0,

  /** Lifecycle (see file header). */
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'paid', 'waived', 'defaulted')),

  /** Notice + payment timestamps. */
  sent_at         TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  /** Wire reference / payment memo — useful for accounting reconciliation. */
  payment_ref     TEXT,

  /** Resend message id when the notice was sent through Anker. */
  resend_message_id TEXT,

  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT capital_call_line_items_call_lp_unique UNIQUE (call_id, fund_lp_id)
);

CREATE INDEX IF NOT EXISTS capital_call_line_items_call_status_idx
  ON capital_call_line_items (call_id, status);
CREATE INDEX IF NOT EXISTS capital_call_line_items_lp_idx
  ON capital_call_line_items (fund_lp_id);

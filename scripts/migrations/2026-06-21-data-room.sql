-- ============================================================================
-- Data room — LP-scoped document store
-- ============================================================================
--
-- One row per uploaded document. Visibility is determined by:
--   - fund_id      : which fund the document belongs to
--   - fund_lp_id   : NULL = visible to every LP on the fund (fund-wide doc:
--                          quarterly letter, capital call notice, etc.)
--                    set  = visible only to that specific LP (per-LP doc:
--                          subscription agreement, K-1, side letter, etc.)
--
-- LP-facing API filters on:
--   WHERE fund_id IN (lps_user_belongs_to) AND (fund_lp_id IS NULL OR fund_lp_id IN (lps_user_belongs_to))
--
-- Admin upload writes the file to Vercel Blob (or public/data-room/ in
-- local dev) and stores the public URL here. We do NOT keep the bytes
-- in postgres.
--
-- Lifecycle
-- ─────────
-- Soft delete via archived_at — preserves audit trail without leaving
-- broken references in old LP letters that link to the doc.
--
-- Categories
-- ──────────
-- Free-text but constrained to a small whitelist so the LP portal can
-- group documents by type without a string-distance fallback:
--   subscription      — sub doc, side letter, KYC
--   quarterly_letter  — the LP-letter PDF
--   capital_call      — call notice PDF
--   distribution      — distribution notice + supporting docs
--   k1                — K-1 / tax form
--   financials        — audited financials, schedule of investments
--   policy            — fund policy docs, LPA, amendments
--   other             — catch-all
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_room_documents (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  fund_id         TEXT        NOT NULL REFERENCES funds(id) ON DELETE CASCADE,

  /** When set, only that LP can see this document. NULL = fund-wide. */
  fund_lp_id      TEXT        REFERENCES fund_lps(id) ON DELETE CASCADE,

  category        TEXT        NOT NULL DEFAULT 'other'
                  CHECK (category IN (
                    'subscription', 'quarterly_letter', 'capital_call',
                    'distribution', 'k1', 'financials', 'policy', 'other'
                  )),

  /** Display title — what LPs see in the portal. */
  title           TEXT        NOT NULL,
  /** Optional free-form description. */
  description     TEXT,

  /** Public file URL (Vercel Blob or local fallback). */
  file_url        TEXT        NOT NULL,
  file_name       TEXT,        -- original filename for download
  content_type    TEXT,
  byte_size       BIGINT,

  /** Source linkage — optional FKs back to the lifecycle event the doc
   *  originated from. Lets a quarterly_letter doc point to its
   *  lp_quarterly_report, etc. */
  source_quarterly_report_id  TEXT,
  source_capital_call_id      TEXT,
  source_distribution_id      TEXT,

  /** Soft delete. */
  archived_at     TIMESTAMPTZ,

  uploaded_by     TEXT,        -- supabase user id
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Fast list-fetch for fund-scoped + LP-scoped views.
CREATE INDEX IF NOT EXISTS data_room_documents_fund_idx
  ON data_room_documents (fund_id, category, created_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS data_room_documents_lp_idx
  ON data_room_documents (fund_lp_id, created_at DESC)
  WHERE archived_at IS NULL AND fund_lp_id IS NOT NULL;

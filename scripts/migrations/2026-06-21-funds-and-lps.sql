-- ============================================================================
-- Funds + LP membership scaffolding
-- ============================================================================
--
-- The portfolio tracker and LP quarterly report both reference a fund via
-- a plain TEXT slug ('svs-fund-ii') because no funds table existed yet.
-- This migration introduces the canonical table, seeds the svs-fund-ii row
-- so nothing dangles, and adds the LP-membership table that capital calls
-- will read from.
--
-- Identity convention
-- ───────────────────
-- - funds.id is the internal UUID (TEXT for consistency with the rest of
--   the codebase).
-- - funds.slug is what callers store on portfolio_companies.fund_id and
--   lp_quarterly_reports.fund_id. We do NOT add a FK constraint on those
--   columns yet — backfilling existing demo rows from text to FK requires
--   a separate transactional step we'll do after the funds row is verified.
--
-- Where this unlocks capital calls
-- ────────────────────────────────
-- A capital call needs to answer "who do we email, how much do we ask each
-- LP for, and how does that update their called_amount?" The fund_lps row
-- carries:
--   - commitment_amount       (the LP's total promise)
--   - called_amount           (what we've drawn so far)
--   - distributed_amount      (what we've returned)
--   - ownership_pct           (their share of the fund, computed at upsert)
--   - lp_contact_id           (FK to contacts — that's where the email lives)
--
-- Capital_calls itself lives in a later migration; this one's just the
-- read-model groundwork.
--
-- Multi-currency
-- ──────────────
-- funds.currency defaults to 'USD' and fund_lps amounts are denominated in
-- the fund's currency. We don't convert at the database layer — reports
-- that need to roll up across funds in different currencies do that in TS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS funds (
  id                       TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  /** URL slug — also what portfolio_companies.fund_id stores. Unique. */
  slug                     TEXT        NOT NULL,
  name                     TEXT        NOT NULL,
  description              TEXT,
  /** Vintage year — when first commitments closed. */
  vintage_year             INT,
  /** Total fund size at close (commitment, not deployed). USD by default. */
  target_size              NUMERIC(14, 2),
  currency                 TEXT        NOT NULL DEFAULT 'USD',
  /** Management fee as fraction — 0.02 = 2%. */
  management_fee_pct       NUMERIC(5, 4),
  /** Carried interest as fraction — 0.20 = 20%. */
  carry_pct                NUMERIC(5, 4),
  /** Total fund term in years (e.g. 10). */
  term_years               INT,
  /** Investment period in years (e.g. 4). After this, new investments stop. */
  investment_period_years  INT,
  /** Lifecycle:
   *    fundraising — still accepting commitments
   *    active      — investment period
   *    harvesting  — post-investment-period, managing existing
   *    closed      — wound down */
  status                   TEXT        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('fundraising', 'active', 'harvesting', 'closed')),
  /** Managing entity — "Summit Venture Studio" etc. */
  manager_org              TEXT,
  metadata                 JSONB       DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT funds_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS funds_status_idx ON funds (status);

-- Seed the canonical svs-fund-ii row so existing portfolio + LP-report
-- data doesn't dangle.  ON CONFLICT keeps this idempotent across re-runs.
INSERT INTO funds (slug, name, vintage_year, currency, status, manager_org, description)
VALUES (
  'svs-fund-ii',
  'Summit Venture Studio — Fund II',
  2026,
  'USD',
  'fundraising',
  'Summit Venture Studio',
  'Anker''s canonical seed fund. Update name, target_size, fee/carry, and lifecycle from /dashboard/portfolio/fund.'
)
ON CONFLICT (slug) DO NOTHING;


CREATE TABLE IF NOT EXISTS fund_lps (
  id                       TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  fund_id                  TEXT        NOT NULL REFERENCES funds(id) ON DELETE CASCADE,

  /** Optional FK to contacts — when the LP is tied to a specific person
   *  in our contacts table (typical for HNW / family-office LPs). When
   *  the LP is an institution we leave it null and store the entity name
   *  in lp_name. */
  lp_contact_id            TEXT        REFERENCES contacts(id) ON DELETE SET NULL,

  /** Display name — denormalised so the list view doesn't need a JOIN.
   *  "Acme Family Office", "Joe Smith", "Sequoia Heritage". */
  lp_name                  TEXT        NOT NULL,

  /** Classification, drives report tone + KYC requirements:
   *    family_office       — single- or multi-family office
   *    institutional       — pension, endowment, sovereign
   *    hnwi                — high-net-worth individual
   *    corporate           — strategic corporate LP
   *    fund_of_funds       — FoF or secondary buyer */
  lp_type                  TEXT
                           CHECK (lp_type IS NULL OR lp_type IN (
                             'family_office', 'institutional', 'hnwi', 'corporate', 'fund_of_funds'
                           )),

  /** Total commitment in fund currency. */
  commitment_amount        NUMERIC(14, 2),
  /** Cumulative capital called from this LP to date. */
  called_amount            NUMERIC(14, 2) DEFAULT 0,
  /** Cumulative distributions paid back. */
  distributed_amount       NUMERIC(14, 2) DEFAULT 0,
  /** Fraction of total fund commitments — denormalised, set by API on
   *  upsert when other commitments are known. */
  ownership_pct            NUMERIC(7, 5),

  /** Subscription doc execution date. */
  signed_at                DATE,
  /** Lifecycle:
   *    committed       — committed, partially or not yet called
   *    fully_called    — 100% of commitment has been called
   *    defaulted       — LP failed to fund a capital call
   *    transferred     — interest sold/transferred to another LP */
  status                   TEXT        NOT NULL DEFAULT 'committed'
                           CHECK (status IN ('committed', 'fully_called', 'defaulted', 'transferred')),

  notes                    TEXT,
  /** Free-form for fee tiers, advisory seats, side-letter terms. */
  metadata                 JSONB       DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT fund_lps_name_per_fund_unique UNIQUE (fund_id, lp_name)
);

CREATE INDEX IF NOT EXISTS fund_lps_fund_status_idx ON fund_lps (fund_id, status);
CREATE INDEX IF NOT EXISTS fund_lps_contact_idx     ON fund_lps (lp_contact_id);

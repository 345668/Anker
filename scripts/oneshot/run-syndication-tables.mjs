/**
 * Patch — Fund Ops Phase 5: syndication (FUND_OPS_DESIGN.md §3.2).
 *
 *   1. funds.vehicle_kind      'fund' | 'spv' | 'studio_fund' — an SPV IS
 *                              a fund, so calls / distributions / ledger /
 *                              statements work on it unchanged.
 *   2. syndicates              deal-scoped SPV metadata (carry to lead,
 *                              platform fee, min ticket, target close).
 *   3. syndicate_partners      the GP's co-invest network.
 *   4. lp_commitment_events    append-only funnel: invited → viewed →
 *                              soft_committed → docs_out → signed → funded
 *                              (→ declined), per vehicle × participant.
 *
 * Idempotent. Runs from the user's Mac:
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-syndication-tables.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("[1/5] Adding funds.vehicle_kind…")
try {
  await sql`ALTER TABLE funds ADD COLUMN IF NOT EXISTS vehicle_kind TEXT NOT NULL DEFAULT 'fund'`
  console.log("       OK  funds.vehicle_kind TEXT DEFAULT 'fund'")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[2/5] Creating syndicates…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS syndicates (
      id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      /** The SPV vehicle — a funds row with vehicle_kind='spv'. */
      spv_fund_id       TEXT NOT NULL UNIQUE REFERENCES funds(id) ON DELETE CASCADE,
      /** The lead vehicle that sourced the deal. */
      lead_fund_id      TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      /** The deal this SPV syndicates. */
      deal_id           TEXT REFERENCES deal_opportunities(id) ON DELETE SET NULL,
      company_name      TEXT NOT NULL,
      allocation_amount NUMERIC(18,2),
      min_ticket        NUMERIC(18,2),
      carry_to_lead_pct NUMERIC(7,5) NOT NULL DEFAULT 0.20,
      platform_fee_pct  NUMERIC(7,5) NOT NULL DEFAULT 0,
      target_close_date DATE,
      status            TEXT NOT NULL DEFAULT 'raising' CHECK (status IN (
        'raising', 'closing', 'closed', 'cancelled'
      )),
      notes             TEXT,
      created_by        TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS syndicates_lead_idx ON syndicates(lead_fund_id)`
  console.log("       OK  syndicates + index")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[3/5] Creating syndicate_partners…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS syndicate_partners (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      /** Owned by the lead fund's org — scoped to the lead fund for now. */
      lead_fund_id  TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      firm          TEXT,
      email         TEXT,
      /** Optional link into the contacts table. */
      contact_id    TEXT,
      partner_type  TEXT NOT NULL DEFAULT 'angel' CHECK (partner_type IN (
        'angel', 'family_office', 'vc_fund', 'corporate', 'hnwi', 'other'
      )),
      sectors       TEXT,
      typical_ticket NUMERIC(18,2),
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS syndicate_partners_fund_idx ON syndicate_partners(lead_fund_id)`
  console.log("       OK  syndicate_partners + index")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[4/5] Creating lp_commitment_events…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS lp_commitment_events (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      /** The vehicle being raised — main fund or SPV. */
      fund_id       TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      /** Exactly one of partner_id / fund_lp_id identifies the participant. */
      partner_id    TEXT REFERENCES syndicate_partners(id) ON DELETE CASCADE,
      fund_lp_id    TEXT,
      stage         TEXT NOT NULL CHECK (stage IN (
        'invited', 'viewed', 'soft_committed', 'docs_out', 'signed', 'funded', 'declined'
      )),
      amount        NUMERIC(18,2),
      note          TEXT,
      created_by    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS lp_commitment_events_fund_idx ON lp_commitment_events(fund_id, created_at)`
  await sql`CREATE INDEX IF NOT EXISTS lp_commitment_events_partner_idx ON lp_commitment_events(partner_id)`
  console.log("       OK  lp_commitment_events + 2 indexes")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[5/5] Sanity check…")
try {
  const [s] = await sql`SELECT COUNT(*)::int AS n FROM syndicates`
  const [p] = await sql`SELECT COUNT(*)::int AS n FROM syndicate_partners`
  console.log(`       OK  syndicates=${s.n}, partners=${p.n}`)
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("Done.")

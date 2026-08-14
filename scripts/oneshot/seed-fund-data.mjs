/**
 * Seed realistic investments (+ valuation snapshots) and LP commitments for the
 * svs-fund-ii fund so the Investments & Partners tables are populated.
 * Idempotent: skips if the fund already has rows.
 *
 * Usage: NEON_DATABASE_URL=… node scripts/oneshot/seed-fund-data.mjs
 */
import { neon } from "@neondatabase/serverless"
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

const fund = await sql`SELECT id FROM funds WHERE slug = 'svs-fund-ii' LIMIT 1`
if (!fund.length) { console.error("fund svs-fund-ii not found"); process.exit(1) }
const fundId = fund[0].id
const rid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

const INV = [
  ["Northstar Labs", "initial", "preferred", "Series A", "2023-03-15", 750000, 8.5, 12000000, "active", 1_650_000, "mark"],
  ["Coastal Technology", "initial", "safe", "Seed", "2022-09-01", 300000, 6.0, 5000000, "active", 900_000, "last_round"],
  ["EA Therapeutics", "initial", "preferred", "Series Seed", "2022-02-26", 432706, 4.2, 10000000, "active", 432_706, "cost"],
  ["Dynamo Chips", "follow_on", "preferred", "Series B", "2024-01-10", 500000, 2.1, 42000000, "active", 700_000, "mark"],
  ["Epic Adventure Inc", "initial", "convertible_note", "Seed", "2021-11-05", 380742, 5.5, 6500000, "written_off", 65_000, "write_down"],
  ["Meridian AI", "initial", "preferred", "Series A", "2023-07-22", 600000, 7.0, 15000000, "active", 1_320_000, "mark"],
  ["Harbor Bio", "secondary", "common", "Secondary", "2024-04-01", 250000, 1.5, 30000000, "active", 260_000, "last_round"],
  ["Quantum Freight", "initial", "safe", "Pre-seed", "2024-06-18", 150000, 9.0, 2000000, "active", 150_000, "cost"],
]

const LPS = [
  ["Redwood University Endowment", "institutional", 5_000_000, 3_250_000, 620_000, 18.5, "committed", "2022-01-15"],
  ["Kapor Capital FoF", "fund_of_funds", 3_500_000, 2_100_000, 410_000, 12.9, "committed", "2022-01-20"],
  ["Meridian Family Office", "family_office", 2_500_000, 1_500_000, 280_000, 9.2, "committed", "2022-02-01"],
  ["Atlas Pension Trust", "institutional", 4_000_000, 4_000_000, 500_000, 14.8, "fully_called", "2022-01-30"],
  ["Seattle Ferry Angels", "hnwi", 1_000_000, 600_000, 90_000, 3.7, "committed", "2022-03-10"],
  ["Liquid 2 Partners", "fund_of_funds", 2_000_000, 1_200_000, 210_000, 7.4, "committed", "2022-02-14"],
  ["Emmeline Ventures LP", "institutional", 3_000_000, 1_800_000, 350_000, 11.1, "committed", "2022-01-25"],
  ["Valor Family Trust", "family_office", 1_500_000, 900_000, 150_000, 5.6, "committed", "2022-04-02"],
]

const invCount = await sql`SELECT count(*)::int c FROM investments WHERE fund_id = ${fundId}`
if (invCount[0].c === 0) {
  for (const [name, kind, sec, round, date, cost, fd, val, status, fv, method] of INV) {
    const id = rid("inv")
    await sql`INSERT INTO investments (id, fund_id, company_name, investment_kind, security_type, round_name, invested_at, cost_basis, fully_diluted_pct, round_valuation, status, realized_proceeds, metadata, created_at, updated_at)
              VALUES (${id}, ${fundId}, ${name}, ${kind}, ${sec}, ${round}, ${date}, ${cost}, ${fd}, ${val}, ${status}, 0, '{}'::jsonb, now(), now())`
    await sql`INSERT INTO valuation_snapshots (id, investment_id, fund_id, as_of_date, fair_value, method, created_at)
              VALUES (${rid("vs")}, ${id}, ${fundId}, CURRENT_DATE, ${fv}, ${method}, now())`
  }
  console.log(`seeded ${INV.length} investments (+ snapshots)`)
} else console.log(`investments exist (${invCount[0].c}) — skipped`)

const lpCount = await sql`SELECT count(*)::int c FROM fund_lps WHERE fund_id = ${fundId}`
if (lpCount[0].c === 0) {
  for (const [name, type, commit, called, dist, own, status, signed] of LPS) {
    await sql`INSERT INTO fund_lps (id, fund_id, lp_name, lp_type, commitment_amount, called_amount, distributed_amount, ownership_pct, status, signed_at, metadata, created_at, updated_at)
              VALUES (${rid("lp")}, ${fundId}, ${name}, ${type}, ${commit}, ${called}, ${dist}, ${own}, ${status}, ${signed}, '{}'::jsonb, now(), now())`
  }
  console.log(`seeded ${LPS.length} LPs`)
} else console.log(`fund_lps exist (${lpCount[0].c}) — skipped`)

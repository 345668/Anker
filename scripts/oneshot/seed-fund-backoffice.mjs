/** Seed capital calls + distributions for svs-fund-ii. Idempotent. */
import { neon } from "@neondatabase/serverless"
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)
const f = await sql`SELECT id FROM funds WHERE slug='svs-fund-ii' LIMIT 1`
if (!f.length) { console.error("fund not found"); process.exit(1) }
const fundId = f[0].id
const rid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

const CALLS = [
  [1, "Initial capital call", "Initial investments & fees", 15, 3_750_000, day(-320), day(-300), "settled"],
  [2, "Follow-on reserves", "Series B follow-ons", 10, 2_500_000, day(-180), day(-160), "settled"],
  [3, "Q3 deployment", "New investments", 12, 3_000_000, day(-40), day(-20), "sent"],
  [4, "Management fees", "Annual management fee", 3, 750_000, null, day(20), "draft"],
]
const DISTS = [
  [1, "Northstar secondary", "secondary", 2_400_000, 60_000, 480_000, 1_860_000, day(-150), "paid"],
  [2, "Coastal partial exit", "exit", 1_200_000, 30_000, 240_000, 930_000, day(-60), "paid"],
  [3, "Dynamo dividend", "dividend", 400_000, 10_000, 78_000, 312_000, day(10), "notified"],
]

const cCount = await sql`SELECT count(*)::int c FROM capital_calls WHERE fund_id=${fundId}`
if (cCount[0].c === 0) {
  for (const [num, title, purpose, pct, total, sent, due, status] of CALLS) {
    await sql`INSERT INTO capital_calls (id, fund_id, call_number, title, purpose, default_call_pct, total_amount, sent_at, due_date, status, created_at, updated_at)
              VALUES (${rid("cc")}, ${fundId}, ${num}, ${title}, ${purpose}, ${pct}, ${total}, ${sent}, ${due}, ${status}, now(), now())`
  }
  console.log(`seeded ${CALLS.length} capital calls`)
} else console.log(`capital_calls exist (${cCount[0].c})`)

const dCount = await sql`SELECT count(*)::int c FROM distributions WHERE fund_id=${fundId}`
if (dCount[0].c === 0) {
  for (const [num, title, source, gross, mgmt, carry, net, pay, status] of DISTS) {
    await sql`INSERT INTO distributions (id, fund_id, distribution_number, title, source, gross_amount, mgmt_fee_deduction, carry_deduction, net_amount, payment_date, status, created_at, updated_at)
              VALUES (${rid("dist")}, ${fundId}, ${num}, ${title}, ${source}, ${gross}, ${mgmt}, ${carry}, ${net}, ${pay}, ${status}, now(), now())`
  }
  console.log(`seeded ${DISTS.length} distributions`)
} else console.log(`distributions exist (${dCount[0].c})`)

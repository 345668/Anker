/** Seed financial reports (Q4-YE 2024 done, Q1 2025 in progress) for svs-fund-ii. Idempotent. */
import { neon } from "@neondatabase/serverless"
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)
const f = await sql`SELECT id, name FROM funds WHERE slug='svs-fund-ii' LIMIT 1`
if (!f.length) { console.error("fund not found"); process.exit(1) }
const fundId = f[0].id, entity = f[0].name
const rid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

function steps(done) {
  return [
    { key: "bank_transactions", group: "Transactions and Investments", label: "Bank Transactions", desc: "Review your bank transactions from this quarter and update transactions that are missing.", status: done ? "done" : "done", completedBy: done ? "Jack Preparson" : "Jack Preparson", completedAt: "2025-04-15" },
    { key: "investment_activity", group: "Transactions and Investments", label: "Investment Activity (SOI)", desc: "Review and approve your investment activity from the quarter.", status: done ? "done" : "done", completedBy: "Jack Preparson", completedAt: "2025-04-15" },
    { key: "internal_review", group: "Financial Report", label: "Internal Review", by: "Carta", desc: "Carta will ensure your financials are accurate and complete.", bullets: ["We'll run an in-depth review of partner transactions", "We'll authenticate all fund transactions", "We'll calculate final numbers to ensure accuracy"], status: done ? "done" : "todo" },
    { key: "your_review", group: "Financial Report", label: "Your Review", desc: "Review and approve your financial report and publish to your limited partners.", status: done ? "done" : "todo" },
  ]
}

const REPORTS = [
  { period: "Q4-YE 2024", status: "done", steps: steps(true) },
  { period: "Q1 2025", status: "needs_review", steps: steps(false) },
]

let created = 0
for (const r of REPORTS) {
  const exists = await sql`SELECT 1 FROM financial_reports WHERE fund_id=${fundId} AND period=${r.period} AND entity_name=${entity} LIMIT 1`
  if (exists.length) continue
  await sql`INSERT INTO financial_reports (id, fund_id, entity_name, period, status, steps, updated_at, created_at)
            VALUES (${rid("fr")}, ${fundId}, ${entity}, ${r.period}, ${r.status}, ${JSON.stringify(r.steps)}::jsonb, now(), now())`
  created++
  console.log(`  + ${r.period} (${r.status})`)
}
console.log(`Done. created ${created}.`)

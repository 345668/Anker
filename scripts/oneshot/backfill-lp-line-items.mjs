/**
 * Backfill capital-call and distribution LINE ITEMS for funds whose headers
 * were seeded directly into the tables, bypassing createCall()/createDistribution().
 *
 * Why this exists (docs/platform-audit-2026-09.md §4):
 *   capital_calls and distributions existed as headers with no line items. Both
 *   the general ledger and LP capital accounts book from LINE ITEMS, not
 *   headers — so contributed capital never reached the GL (cash went negative)
 *   and every LP capital account reported null DPI/TVPI.
 *
 * Allocation: pro-rata by commitment across non-transferred LPs — the same rule
 * createCall() applies. Uses largest-remainder rounding so the allocated lines
 * sum EXACTLY to the header amount (no cent drift).
 *
 * Basis:
 *   capital calls  → capital_calls.total_amount
 *   distributions  → distributions.net_amount  (what LPs actually receive,
 *                    i.e. gross less mgmt fee and carry)
 *
 * Status/date mapping mirrors the header, so the ledger books only what is
 * genuinely paid:
 *   call settled → 'paid'   (paid_at = due_date)
 *   call sent    → 'sent'   (sent_at = call.sent_at)
 *   call draft   → 'pending'
 *   dist paid    → 'paid'   (paid_at = payment_date)
 *   dist notified→ 'notified' (notified_at = payment_date)
 *
 * IDEMPOTENT: any call/distribution that already has line items is skipped.
 * DRY-RUN BY DEFAULT — pass --apply to write.
 *
 * Usage:
 *   node scripts/oneshot/backfill-lp-line-items.mjs [--fund <fundId>] [--apply]
 */
import { neon } from "@neondatabase/serverless"
import { readFileSync } from "node:fs"

// ── env ──────────────────────────────────────────────────────────────────────
try {
  const env = readFileSync(".env.local", "utf8")
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*(NEON_DATABASE_URL|DATABASE_URL)\s*=\s*(.+)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
} catch { /* env may come from the shell */ }

const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL or DATABASE_URL required"); process.exit(1) }
const sql = neon(url, { fullResults: true })

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const fundArg = args.indexOf("--fund")
const FUND_FILTER = fundArg >= 0 ? args[fundArg + 1] : null

const money = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Split `total` across `lps` pro-rata by commitment, to 2dp, such that the
 * parts sum exactly to `total`. Largest-remainder: floor everything, then hand
 * the leftover cents to the biggest fractional remainders.
 */
function allocate(total, lps) {
  const totalCents = Math.round(Number(total) * 100)
  const commitSum = lps.reduce((s, lp) => s + Number(lp.commitment_amount || 0), 0)
  if (commitSum <= 0) return lps.map((lp) => ({ lp, cents: 0 }))

  const raw = lps.map((lp) => {
    const exact = (totalCents * Number(lp.commitment_amount || 0)) / commitSum
    return { lp, floor: Math.floor(exact), rem: exact - Math.floor(exact) }
  })
  let left = totalCents - raw.reduce((s, r) => s + r.floor, 0)
  raw.sort((a, b) => b.rem - a.rem || Number(b.lp.commitment_amount) - Number(a.lp.commitment_amount))
  for (let i = 0; i < raw.length && left > 0; i++, left--) raw[i].floor++
  return raw.map((r) => ({ lp: r.lp, cents: r.floor }))
}

const CALL_STATUS = { settled: "paid", sent: "sent", draft: "pending", cancelled: "pending" }
const DIST_STATUS = { paid: "paid", notified: "notified", draft: "pending" }

async function main() {
  console.log(APPLY ? "MODE: APPLY (writing)\n" : "MODE: DRY RUN (no writes — pass --apply to commit)\n")

  const funds = (await sql.query(
    FUND_FILTER ? `SELECT id, name FROM funds WHERE id = $1` : `SELECT id, name FROM funds ORDER BY name`,
    FUND_FILTER ? [FUND_FILTER] : [],
  )).rows

  let created = 0, skipped = 0

  for (const fund of funds) {
    const lps = (await sql.query(
      `SELECT id, lp_name, commitment_amount FROM fund_lps
        WHERE fund_id = $1 AND COALESCE(status,'') <> 'transferred'
        ORDER BY commitment_amount DESC`, [fund.id],
    )).rows
    if (!lps.length) { console.log(`· ${fund.name}: no LPs, skipping`); continue }

    const commitSum = lps.reduce((s, l) => s + Number(l.commitment_amount || 0), 0)
    console.log(`\n=== ${fund.name} — ${lps.length} LPs, $${money(commitSum)} committed ===`)

    // ── capital calls ────────────────────────────────────────────────────────
    const calls = (await sql.query(
      `SELECT id, call_number, title, total_amount, status, due_date, sent_at, created_at
         FROM capital_calls WHERE fund_id = $1 ORDER BY call_number`, [fund.id],
    )).rows

    for (const c of calls) {
      const have = Number((await sql.query(
        `SELECT COUNT(*)::int n FROM capital_call_line_items WHERE call_id = $1`, [c.id],
      )).rows[0].n)
      if (have > 0) { console.log(`  call #${c.call_number} "${c.title}" — ${have} line items already, SKIP`); skipped++; continue }

      const lineStatus = CALL_STATUS[c.status] ?? "pending"
      const paidAt = lineStatus === "paid" ? (c.due_date ?? c.sent_at ?? c.created_at) : null
      const sentAt = lineStatus === "paid" || lineStatus === "sent" ? (c.sent_at ?? null) : null
      const parts = allocate(c.total_amount, lps)
      const sum = parts.reduce((s, p) => s + p.cents, 0) / 100

      console.log(`  call #${c.call_number} "${c.title}" $${money(c.total_amount)} [${c.status} → lines '${lineStatus}'] → ${parts.length} lines, sum $${money(sum)}${sum === Number(c.total_amount) ? " ✓" : " ✗ MISMATCH"}`)

      if (APPLY) {
        for (const p of parts) {
          await sql.query(
            `INSERT INTO capital_call_line_items
               (call_id, fund_lp_id, amount, status, sent_at, paid_at, notes, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
            [c.id, p.lp.id, (p.cents / 100).toFixed(2), lineStatus, sentAt, paidAt,
             "backfilled pro-rata by commitment (audit 2026-09)"],
          )
          created++
        }
      }
    }

    // ── distributions ────────────────────────────────────────────────────────
    const dists = (await sql.query(
      `SELECT id, distribution_number, title, net_amount, status, payment_date, created_at
         FROM distributions WHERE fund_id = $1 ORDER BY distribution_number`, [fund.id],
    )).rows

    for (const d of dists) {
      const have = Number((await sql.query(
        `SELECT COUNT(*)::int n FROM distribution_line_items WHERE distribution_id = $1`, [d.id],
      )).rows[0].n)
      if (have > 0) { console.log(`  dist #${d.distribution_number} "${d.title}" — ${have} line items already, SKIP`); skipped++; continue }

      const lineStatus = DIST_STATUS[d.status] ?? "pending"
      const paidAt = lineStatus === "paid" ? (d.payment_date ?? d.created_at) : null
      const notifiedAt = lineStatus === "paid" || lineStatus === "notified" ? (d.payment_date ?? d.created_at) : null
      const parts = allocate(d.net_amount, lps)
      const sum = parts.reduce((s, p) => s + p.cents, 0) / 100

      console.log(`  dist #${d.distribution_number} "${d.title}" net $${money(d.net_amount)} [${d.status} → lines '${lineStatus}'] → ${parts.length} lines, sum $${money(sum)}${sum === Number(d.net_amount) ? " ✓" : " ✗ MISMATCH"}`)

      if (APPLY) {
        for (const p of parts) {
          await sql.query(
            `INSERT INTO distribution_line_items
               (distribution_id, fund_lp_id, amount, status, notified_at, paid_at, notes, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
            [d.id, p.lp.id, (p.cents / 100).toFixed(2), lineStatus, notifiedAt, paidAt,
             "backfilled pro-rata by commitment (audit 2026-09)"],
          )
          created++
        }
      }
    }
  }

  console.log(`\n${APPLY ? "Created" : "Would create"} ${APPLY ? created : "…"} line items; ${skipped} header(s) skipped (already populated).`)
  if (!APPLY) console.log("Re-run with --apply to write.")
  else console.log("\nNext: rebuild the ledger so contributions/distributions post to the GL.")
}

main().catch((e) => { console.error(e); process.exit(1) })

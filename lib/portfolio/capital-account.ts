/**
 * Capital account statements — the per-LP transaction-history artifact.
 *
 * What this module does
 * ─────────────────────
 * Given (fundId, lpId, asOfDate?), assemble a single object containing
 * everything an LP needs to reconcile their position:
 *
 *   - Fund + LP header info (name, commitment, ownership %).
 *   - Summary line: commitment, total called, total distributed, uncalled.
 *   - Optional performance metrics (TVPI / DPI / RVPI) — only when caller
 *     supplies a current NAV. Without NAV we surface DPI only.
 *   - Chronological transaction history: every PAID capital-call line item
 *     and every PAID distribution line item, ordered by paid_at, with
 *     running balances after each row.
 *
 * Why this is a separate module
 * ─────────────────────────────
 *   - The compute is identical whether the statement is rendered as HTML
 *     in the dashboard, as a PDF for LP download, or as JSON for an LP
 *     portal client. One source of truth.
 *   - The transaction-history join is non-trivial (UNION across two child
 *     tables, both filtered by line-item status, both joined back to their
 *     parent for the human-readable number/title); easier to read once.
 *
 * What this module deliberately does NOT do
 * ─────────────────────────────────────────
 *   - NAV tracking — not built yet. The optional `currentNav` parameter
 *     is just a number the caller passes in; we surface the metrics if it's
 *     non-null and otherwise leave them blank. Future NAV-snapshot table
 *     will hook in here.
 *   - PDF rendering — done in app/api/portfolio/.../statement/pdf so we
 *     can reuse the existing export infra.
 *   - Authorization — the API route handles requireAdmin/LP-portal scoping.
 */

import { sql } from "@/lib/db"
import { getFundById, getLpById, type FundFull, type FundLpFull } from "@/lib/portfolio/funds"

// ── public types ────────────────────────────────────────────────────────

export type StatementTxnType = "contribution" | "distribution"

export interface StatementTransaction {
  /** ISO date — paid_at on the line item. */
  date: string
  type: StatementTxnType
  /** call_number for contributions, distribution_number for distributions. */
  referenceNumber: number
  /** Parent capital_calls.title or distributions.title. */
  title: string
  /** Absolute amount (always positive). Use `type` to interpret direction. */
  amount: number
  /** Bank wire reference / Stripe ID / whatever the GP recorded. */
  paymentRef: string | null
  /** Free-text note on the line item. */
  notes: string | null
  /** Running uncalled commitment after this transaction (contributions only;
   *  distributions don't change it). For UI display in the right rail. */
  runningUncalledCommitment: number
  /** Running total distributed up to and including this row. */
  runningDistributedTotal: number
  /** Running total contributed up to and including this row. */
  runningContributedTotal: number
}

export interface StatementSummary {
  /** Total LP commitment to the fund. */
  commitment: number | null
  /** Sum of PAID capital-call line items for this LP. */
  totalContributed: number
  /** Sum of PAID distribution line items for this LP. */
  totalDistributed: number
  /** commitment − totalContributed, floored at 0. Null when commitment unset. */
  uncalledCommitment: number | null
  /** totalDistributed − totalContributed. Positive = LP has received more
   *  than they put in (DPI > 1). */
  netCashFlow: number
  /** Caller-supplied current NAV (the LP's share of the fund's NAV). */
  currentNav: number | null
  /** distributions / contributions. Null when contributions = 0. */
  dpi: number | null
  /** (distributions + nav) / contributions. Null when NAV or contributions
   *  are missing. */
  tvpi: number | null
  /** nav / contributions. Null when either missing. */
  rvpi: number | null
}

export interface CapitalAccountStatement {
  /** When the LP wants the position evaluated. Defaults to "now" (server
   *  time at build). The transaction list is filtered to paid_at <= asOfDate. */
  asOfDate: string
  /** Server time the statement object was built — for the footer audit line. */
  generatedAt: string
  fund: FundFull
  lp: FundLpFull
  summary: StatementSummary
  transactions: StatementTransaction[]
}

// ── builder ─────────────────────────────────────────────────────────────

export interface BuildStatementInput {
  fundId: string
  lpId: string
  /** Optional cutoff. ISO date or full timestamp. */
  asOfDate?: string | null
  /** When supplied, drives TVPI/RVPI. Caller responsibility to pass the LP's
   *  pro-rata share of the fund NAV, not the gross fund NAV. */
  currentNav?: number | null
}

export async function buildStatement(input: BuildStatementInput): Promise<CapitalAccountStatement | null> {
  const fund = await getFundById(input.fundId)
  if (!fund) return null
  const lp = await getLpById(input.lpId)
  if (!lp || lp.fund_id !== fund.id) return null

  // Normalise as-of cutoff. NULL means "everything paid to date".
  const asOfRaw = (input.asOfDate ?? "").trim()
  const asOfDate = asOfRaw || new Date().toISOString()
  // We compare against paid_at which is TIMESTAMPTZ; passing the ISO string
  // directly is fine — PG casts.

  // 1. Paid capital-call line items for this LP, with parent call info.
  //    JOIN to capital_calls for the call_number + title.
  const contributionRows: any[] = await sql`
    SELECT
      cli.id            AS line_id,
      cli.amount        AS amount,
      cli.paid_at       AS paid_at,
      cli.payment_ref   AS payment_ref,
      cli.notes         AS notes,
      cc.call_number    AS reference_number,
      cc.title          AS title
    FROM capital_call_line_items cli
    JOIN capital_calls cc ON cc.id = cli.call_id
    WHERE cli.fund_lp_id = ${lp.id}
      AND cli.status     = 'paid'
      AND cli.paid_at IS NOT NULL
      AND cli.paid_at   <= ${asOfDate}::timestamptz
    ORDER BY cli.paid_at ASC
  `

  // 2. Paid distribution line items for this LP, with parent distribution.
  const distributionRows: any[] = await sql`
    SELECT
      dli.id                AS line_id,
      dli.amount            AS amount,
      dli.paid_at           AS paid_at,
      dli.payment_ref       AS payment_ref,
      dli.notes             AS notes,
      d.distribution_number AS reference_number,
      d.title               AS title
    FROM distribution_line_items dli
    JOIN distributions d ON d.id = dli.distribution_id
    WHERE dli.fund_lp_id = ${lp.id}
      AND dli.status     = 'paid'
      AND dli.paid_at IS NOT NULL
      AND dli.paid_at   <= ${asOfDate}::timestamptz
    ORDER BY dli.paid_at ASC
  `

  // 3. Merge into a single chronological list and compute running balances.
  type Raw = {
    paid_at: string
    type: StatementTxnType
    amount: number
    referenceNumber: number
    title: string
    paymentRef: string | null
    notes: string | null
  }
  const all: Raw[] = [
    ...contributionRows.map((r) => ({
      paid_at: String(r.paid_at),
      type: "contribution" as const,
      amount: Number(r.amount ?? 0),
      referenceNumber: Number(r.reference_number ?? 0),
      title: r.title ?? "Capital call",
      paymentRef: r.payment_ref ?? null,
      notes: r.notes ?? null,
    })),
    ...distributionRows.map((r) => ({
      paid_at: String(r.paid_at),
      type: "distribution" as const,
      amount: Number(r.amount ?? 0),
      referenceNumber: Number(r.reference_number ?? 0),
      title: r.title ?? "Distribution",
      paymentRef: r.payment_ref ?? null,
      notes: r.notes ?? null,
    })),
  ].sort((a, b) => {
    // Stable sort by paid_at ascending. Tie-breaker: contribution before
    // distribution on the same instant (otherwise a same-day pay-in /
    // pay-out can show negative uncalled briefly).
    const cmp = a.paid_at.localeCompare(b.paid_at)
    if (cmp !== 0) return cmp
    if (a.type === b.type) return 0
    return a.type === "contribution" ? -1 : 1
  })

  const commitment = lp.commitment_amount ?? null
  let runningContributed = 0
  let runningDistributed = 0
  const transactions: StatementTransaction[] = all.map((r) => {
    if (r.type === "contribution") runningContributed += r.amount
    else runningDistributed += r.amount
    const runningUncalled =
      commitment != null ? Math.max(0, commitment - runningContributed) : 0
    return {
      date: toIsoDate(r.paid_at),
      type: r.type,
      referenceNumber: r.referenceNumber,
      title: r.title,
      amount: r.amount,
      paymentRef: r.paymentRef,
      notes: r.notes,
      runningUncalledCommitment: runningUncalled,
      runningContributedTotal: runningContributed,
      runningDistributedTotal: runningDistributed,
    }
  })

  // 4. Summary line (uses the running totals — equivalent to a final SUM).
  const totalContributed = runningContributed
  const totalDistributed = runningDistributed
  const currentNav = input.currentNav != null && Number.isFinite(Number(input.currentNav))
    ? Number(input.currentNav)
    : null
  const dpi = totalContributed > 0 ? round4(totalDistributed / totalContributed) : null
  const tvpi = currentNav != null && totalContributed > 0
    ? round4((totalDistributed + currentNav) / totalContributed)
    : null
  const rvpi = currentNav != null && totalContributed > 0
    ? round4(currentNav / totalContributed)
    : null

  const summary: StatementSummary = {
    commitment,
    totalContributed,
    totalDistributed,
    uncalledCommitment: commitment != null ? Math.max(0, commitment - totalContributed) : null,
    netCashFlow: totalDistributed - totalContributed,
    currentNav,
    dpi,
    tvpi,
    rvpi,
  }

  return {
    asOfDate: toIsoDate(asOfDate),
    generatedAt: new Date().toISOString(),
    fund,
    lp,
    summary,
    transactions,
  }
}

// ── helpers ─────────────────────────────────────────────────────────────

function toIsoDate(v: string): string {
  // Accepts full ISO timestamps or bare YYYY-MM-DD; returns YYYY-MM-DD.
  if (!v) return new Date().toISOString().slice(0, 10)
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

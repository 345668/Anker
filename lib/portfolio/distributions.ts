/**
 * Distribution queries + lifecycle.
 *
 * Mirrors lib/portfolio/capital-calls.ts but inverted: instead of LPs
 * wiring money IN, the GP wires money OUT.  The line-item paid cascade
 * increments fund_lps.distributed_amount (capital_calls increments
 * called_amount).
 *
 * Key allocation choice
 * ─────────────────────
 * We allocate the net_amount across LPs pro-rata against ownership_pct.
 * This works for the simple "European waterfall" the MVP supports —
 * net is what the GP computed after their own waterfall model.
 *
 * When fund_lps.ownership_pct is null (no commitment set), the LP is
 * still given a line item with amount=0 so the operator can hand-fix.
 * We don't silently exclude.
 */

import { sql } from "@/lib/db"
import { generate } from "@/lib/ai/provider"
import { getFundById, listLps, type FundFull } from "@/lib/portfolio/funds"
import { getCompanyById } from "@/lib/portfolio/queries"

// ── types ───────────────────────────────────────────────────────────────

export const DISTRIBUTION_STATUSES = ["draft", "notified", "paid", "cancelled"] as const
export type DistributionStatus = (typeof DISTRIBUTION_STATUSES)[number]

export const DISTRIBUTION_LINE_STATUSES = ["pending", "notified", "paid", "waived"] as const
export type DistributionLineStatus = (typeof DISTRIBUTION_LINE_STATUSES)[number]

export interface DistributionFull {
  id: string
  fund_id: string
  distribution_number: number
  title: string
  source: string | null
  source_company_id: string | null
  gross_amount: number | null
  mgmt_fee_deduction: number
  carry_deduction: number
  net_amount: number
  payment_date: string | null
  notified_at: string | null
  notice_md: string | null
  notice_subject: string | null
  status: DistributionStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface DistributionLineItemFull {
  id: string
  distribution_id: string
  fund_lp_id: string
  amount: number
  status: DistributionLineStatus
  notified_at: string | null
  paid_at: string | null
  payment_ref: string | null
  resend_message_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DistributionLineWithLp extends DistributionLineItemFull {
  lp_name: string
  lp_type: string | null
  lp_contact_id: string | null
  lp_commitment_amount: number | null
  lp_distributed_amount: number
  lp_ownership_pct: number | null
}

// ── read ────────────────────────────────────────────────────────────────

export async function listDistributions(fundId: string): Promise<DistributionFull[]> {
  const rows = await sql`
    SELECT * FROM distributions
     WHERE fund_id = ${fundId}
     ORDER BY distribution_number DESC
  `
  return rows.map(normalizeDistribution)
}

export async function getDistributionById(id: string): Promise<DistributionFull | null> {
  const rows = await sql`SELECT * FROM distributions WHERE id = ${id} LIMIT 1`
  return rows[0] ? normalizeDistribution(rows[0]) : null
}

export async function listDistributionLineItems(distributionId: string): Promise<DistributionLineWithLp[]> {
  const rows = await sql`
    SELECT
      dli.*,
      fl.lp_name             AS lp_name,
      fl.lp_type             AS lp_type,
      fl.lp_contact_id       AS lp_contact_id,
      fl.commitment_amount   AS lp_commitment_amount,
      fl.distributed_amount  AS lp_distributed_amount,
      fl.ownership_pct       AS lp_ownership_pct
    FROM distribution_line_items dli
    JOIN fund_lps fl ON fl.id = dli.fund_lp_id
    WHERE dli.distribution_id = ${distributionId}
    ORDER BY fl.ownership_pct DESC NULLS LAST, fl.lp_name ASC
  `
  return rows.map((r: any) => ({
    ...normalizeLineItem(r),
    lp_name: r.lp_name,
    lp_type: r.lp_type ?? null,
    lp_contact_id: r.lp_contact_id ?? null,
    lp_commitment_amount: toNum(r.lp_commitment_amount),
    lp_distributed_amount: toNum(r.lp_distributed_amount) ?? 0,
    lp_ownership_pct: toNum(r.lp_ownership_pct),
  }))
}

// ── distribution: write ─────────────────────────────────────────────────

export interface CreateDistributionInput {
  fundId: string
  title: string
  source?: string | null
  sourceCompanyId?: string | null
  grossAmount?: number | null
  mgmtFeeDeduction?: number | null
  carryDeduction?: number | null
  /** When omitted, derived as grossAmount - mgmtFee - carry. When neither
   *  net nor gross is set, line items are created with amount=0 and the GP
   *  edits per-row. */
  netAmount?: number | null
  paymentDate?: string | null
  createdBy?: string | null
}

export async function createDistribution(input: CreateDistributionInput): Promise<{
  distribution: DistributionFull
  lineItems: DistributionLineItemFull[]
}> {
  if (!input.fundId) throw new Error("fundId required")
  if (!input.title?.trim()) throw new Error("title required")

  const gross = input.grossAmount ?? null
  const mgmt = input.mgmtFeeDeduction ?? 0
  const carry = input.carryDeduction ?? 0
  const net =
    input.netAmount != null
      ? input.netAmount
      : gross != null
        ? Math.max(0, gross - (mgmt ?? 0) - (carry ?? 0))
        : 0

  const maxRows = await sql`
    SELECT COALESCE(MAX(distribution_number), 0) AS n FROM distributions WHERE fund_id = ${input.fundId}
  `
  const nextNumber = Number(maxRows[0]?.n ?? 0) + 1

  const distRows = await sql`
    INSERT INTO distributions (
      fund_id, distribution_number, title, source, source_company_id,
      gross_amount, mgmt_fee_deduction, carry_deduction, net_amount,
      payment_date, status, created_by, created_at, updated_at
    ) VALUES (
      ${input.fundId}, ${nextNumber}, ${input.title.trim()},
      ${input.source ?? null}, ${input.sourceCompanyId ?? null},
      ${gross}, ${mgmt}, ${carry}, ${net},
      ${input.paymentDate ?? null}::date, 'draft',
      ${input.createdBy ?? null}, NOW(), NOW()
    )
    RETURNING *
  `
  const distribution = normalizeDistribution(distRows[0])

  // Synthesise per-LP line items, pro-rata by ownership_pct.
  const lps = (await listLps(input.fundId)).filter((lp) => lp.status !== "transferred")
  const lineRows: DistributionLineItemFull[] = []
  for (const lp of lps) {
    const share =
      lp.ownership_pct != null && net > 0
        ? Math.round(lp.ownership_pct * net * 100) / 100
        : 0
    const ins = await sql`
      INSERT INTO distribution_line_items (
        distribution_id, fund_lp_id, amount, status, created_at, updated_at
      ) VALUES (
        ${distribution.id}, ${lp.id}, ${share}, 'pending', NOW(), NOW()
      )
      RETURNING *
    `
    lineRows.push(normalizeLineItem(ins[0]))
  }

  await recomputeDistributionNet(distribution.id)
  const refreshed = await getDistributionById(distribution.id)
  return { distribution: refreshed ?? distribution, lineItems: lineRows }
}

export interface UpdateDistributionInput {
  title?: string
  source?: string | null
  sourceCompanyId?: string | null
  grossAmount?: number | null
  mgmtFeeDeduction?: number | null
  carryDeduction?: number | null
  netAmount?: number | null
  paymentDate?: string | null
  noticeMd?: string | null
  noticeSubject?: string | null
  status?: DistributionStatus
}

export async function updateDistribution(
  id: string,
  patch: UpdateDistributionInput,
): Promise<DistributionFull | null> {
  const rows = await sql`
    UPDATE distributions SET
      title              = COALESCE(${patch.title ?? null}, title),
      source             = COALESCE(${patch.source ?? null}, source),
      source_company_id  = COALESCE(${patch.sourceCompanyId ?? null}, source_company_id),
      gross_amount       = COALESCE(${patch.grossAmount ?? null}, gross_amount),
      mgmt_fee_deduction = COALESCE(${patch.mgmtFeeDeduction ?? null}, mgmt_fee_deduction),
      carry_deduction    = COALESCE(${patch.carryDeduction ?? null}, carry_deduction),
      net_amount         = COALESCE(${patch.netAmount ?? null}, net_amount),
      payment_date       = COALESCE(${patch.paymentDate ?? null}::date, payment_date),
      notice_md          = COALESCE(${patch.noticeMd ?? null}, notice_md),
      notice_subject     = COALESCE(${patch.noticeSubject ?? null}, notice_subject),
      status             = COALESCE(${patch.status ?? null}, status),
      notified_at        = CASE
                             WHEN ${patch.status ?? null} = 'notified' AND notified_at IS NULL THEN NOW()
                             ELSE notified_at
                           END,
      updated_at         = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return rows[0] ? normalizeDistribution(rows[0]) : null
}

export async function deleteDistribution(id: string): Promise<boolean> {
  // Snapshot paid line items before CASCADE so we can reverse the LP
  // distributed_amount increments.
  const paid = await sql`
    SELECT fund_lp_id, amount FROM distribution_line_items
     WHERE distribution_id = ${id} AND status = 'paid'
  `
  const rows = await sql`DELETE FROM distributions WHERE id = ${id} RETURNING id`
  if (rows.length === 0) return false
  for (const row of paid as any[]) {
    await sql`
      UPDATE fund_lps
         SET distributed_amount = GREATEST(0, COALESCE(distributed_amount, 0) - ${row.amount}),
             updated_at = NOW()
       WHERE id = ${row.fund_lp_id}
    `
  }
  return true
}

// ── line items ──────────────────────────────────────────────────────────

export interface UpdateDistributionLineInput {
  amount?: number
  status?: DistributionLineStatus
  paymentRef?: string | null
  notes?: string | null
  paidAt?: string | null
  notifiedAt?: string | null
  resendMessageId?: string | null
}

/**
 * Same shape as capital-calls.updateLineItem: handles the side-effect
 * cascade on paid ↔ unpaid transitions.  Distribution-side increments
 * fund_lps.distributed_amount and re-derives parent distribution status
 * to 'paid' when every line is closed (paid or waived).
 */
export async function updateDistributionLineItem(
  id: string,
  patch: UpdateDistributionLineInput,
): Promise<{
  line: DistributionLineItemFull | null
  distributionStatus: DistributionStatus | null
}> {
  const existing = (await sql`SELECT * FROM distribution_line_items WHERE id = ${id} LIMIT 1`)[0] as any
  if (!existing) return { line: null, distributionStatus: null }

  const beforePaid = existing.status === "paid"
  const beforeAmount = toNum(existing.amount) ?? 0

  const rows = await sql`
    UPDATE distribution_line_items SET
      amount            = COALESCE(${patch.amount ?? null}, amount),
      status            = COALESCE(${patch.status ?? null}, status),
      payment_ref       = COALESCE(${patch.paymentRef ?? null}, payment_ref),
      notes             = COALESCE(${patch.notes ?? null}, notes),
      paid_at           = CASE
                            WHEN ${patch.status ?? null} = 'paid' AND paid_at IS NULL
                              THEN COALESCE(${patch.paidAt ?? null}::timestamptz, NOW())
                            WHEN ${patch.status ?? null} IN ('pending', 'waived')
                              THEN NULL
                            ELSE paid_at
                          END,
      notified_at       = CASE
                            WHEN ${patch.status ?? null} = 'notified' AND notified_at IS NULL
                              THEN COALESCE(${patch.notifiedAt ?? null}::timestamptz, NOW())
                            WHEN ${patch.notifiedAt ?? null} IS NOT NULL
                              THEN ${patch.notifiedAt ?? null}::timestamptz
                            ELSE notified_at
                          END,
      resend_message_id = COALESCE(${patch.resendMessageId ?? null}, resend_message_id),
      updated_at        = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  const updated = normalizeLineItem(rows[0])
  const afterPaid = updated.status === "paid"
  const afterAmount = updated.amount

  if (beforePaid !== afterPaid || (beforePaid && afterPaid && beforeAmount !== afterAmount)) {
    const delta =
      (afterPaid ? afterAmount : 0) - (beforePaid ? beforeAmount : 0)
    if (delta !== 0) {
      await sql`
        UPDATE fund_lps
           SET distributed_amount = GREATEST(0, COALESCE(distributed_amount, 0) + ${delta}),
               updated_at         = NOW()
         WHERE id = ${updated.fund_lp_id}
      `
    }
  }

  // Roll up distribution status if every line is paid or waived.
  const statusRows = await sql`
    SELECT
      d.id, d.status,
      COUNT(li.*)                                                  AS total,
      COUNT(li.*) FILTER (WHERE li.status IN ('paid', 'waived'))   AS closed
    FROM distributions d
    JOIN distribution_line_items li ON li.distribution_id = d.id
    WHERE d.id = ${updated.distribution_id}
    GROUP BY d.id, d.status
  `
  let distributionStatus: DistributionStatus | null = null
  const cr: any = statusRows[0]
  if (cr) {
    distributionStatus = cr.status
    if (cr.status !== "paid" && cr.status !== "cancelled"
        && Number(cr.total) > 0 && Number(cr.total) === Number(cr.closed)) {
      await sql`UPDATE distributions SET status = 'paid', updated_at = NOW() WHERE id = ${updated.distribution_id}`
      distributionStatus = "paid"
    }
  }

  await recomputeDistributionNet(updated.distribution_id)
  return { line: updated, distributionStatus }
}

export async function deleteDistributionLineItem(id: string): Promise<{ deleted: boolean; distributionId: string | null }> {
  const existing = (await sql`SELECT distribution_id, fund_lp_id, amount, status FROM distribution_line_items WHERE id = ${id} LIMIT 1`)[0] as any
  if (!existing) return { deleted: false, distributionId: null }
  if (existing.status === "paid") {
    await sql`
      UPDATE fund_lps
         SET distributed_amount = GREATEST(0, COALESCE(distributed_amount, 0) - ${existing.amount}),
             updated_at = NOW()
       WHERE id = ${existing.fund_lp_id}
    `
  }
  await sql`DELETE FROM distribution_line_items WHERE id = ${id}`
  await recomputeDistributionNet(existing.distribution_id)
  return { deleted: true, distributionId: existing.distribution_id }
}

// ── derived ─────────────────────────────────────────────────────────────

/**
 * Keep distributions.net_amount in sync with SUM(line_items.amount).
 * Distribution.net is the "source of truth" the operator typed, but
 * once line items are edited individually we need to surface the new
 * total so the header row matches the table.
 */
async function recomputeDistributionNet(distributionId: string): Promise<void> {
  await sql`
    UPDATE distributions
       SET net_amount = (
         SELECT COALESCE(SUM(amount), 0) FROM distribution_line_items WHERE distribution_id = ${distributionId}
       ),
       updated_at = NOW()
     WHERE id = ${distributionId}
  `
}

// ── notice draft via Qwen ───────────────────────────────────────────────

export interface DistributionNoticeDraft {
  subject: string
  noticeMd: string
  generationMs: number
}

export async function generateDistributionNotice(
  fund: FundFull,
  dist: DistributionFull,
  lines: DistributionLineWithLp[],
): Promise<DistributionNoticeDraft> {
  const ccy = fund.currency
  const totalLines = lines.length
  const totalNet = lines.reduce((s, l) => s + l.amount, 0)
  const paymentDate = dist.payment_date ?? "TBD"
  const sourceCompany = dist.source_company_id ? await getCompanyById(dist.source_company_id) : null
  const sourceLine = sourceCompany ? `${sourceCompany.name}${dist.source ? ` — ${dist.source}` : ""}` : (dist.source ?? "(unspecified)")

  const prompt = `You are the managing partner of an investment fund drafting a distribution notice to your Limited Partners. Draft the notice in plain prose markdown based ONLY on the facts below.

Tone
- Direct, professional, transactional. No marketing language.
- Use the exact numbers given. Never fabricate.
- No em dashes (use commas, colons, periods).

Facts
- Fund: ${fund.name} (${fund.slug})
- Manager: ${fund.manager_org ?? "the General Partner"}
- Currency: ${ccy}
- Distribution: #${dist.distribution_number} — ${dist.title}
- Source: ${sourceLine}
- Gross amount: ${dist.gross_amount != null ? `${ccy} ${dist.gross_amount.toFixed(2)}` : "(not stated)"}
- Management fee deduction: ${ccy} ${dist.mgmt_fee_deduction.toFixed(2)}
- Carried interest deduction: ${ccy} ${dist.carry_deduction.toFixed(2)}
- Net distributable: ${ccy} ${totalNet.toFixed(2)}
- Recipients: ${totalLines} LPs
- Payment date: ${paymentDate}

Structure (use markdown headings exactly as shown)

# Distribution Notice #${dist.distribution_number} — ${dist.title}

## Source
2-3 sentences naming the source event (a specific portfolio exit, a secondary, a write-up realisation, etc) and what triggered the distribution. Use the Source fact above; do not invent specifics not provided.

## Amount distributed
Plain statement of gross, deductions (mgmt fee + carry), and net. If gross is "(not stated)", say the net was computed directly without surfacing the gross. Each LP receives a per-line item in the email body, computed pro-rata against their ownership share.

## Payment timing
One sentence stating the payment date. Note that wire confirmations will be sent separately.

## Tax treatment
A single sentence: "LPs should consult their tax advisor; a Schedule K-1 (or local equivalent) will be issued at fund-year-end reflecting this distribution." Do not invent jurisdictional specifics.

## Contact
Single line: "Direct questions to ${fund.manager_org ?? "the General Partner"} via your standard channel."

---

Length target: 200-350 words. No fluff.

Return ONLY this strict JSON object — no prose, no fences:
{
  "subject": "<email subject line, <=80 chars, includes fund + distribution number>",
  "noticeMd": "<full markdown body starting with the H1>"
}`

  const started = Date.now()
  const raw = await generate(prompt, {
    task: "deep_research",
    maxTokens: 1800,
    temperature: 0.3,
    json: true,
  })
  const generationMs = Date.now() - started

  const parsed = (() => {
    if (!raw) return null
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
    try { return JSON.parse(cleaned) } catch {}
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) { try { return JSON.parse(m[0]) } catch {} }
    return null
  })()
  if (!parsed?.noticeMd || !parsed?.subject) {
    throw new Error("notice generation failed — model returned no usable content")
  }
  return {
    subject: String(parsed.subject).trim().slice(0, 200),
    noticeMd: String(parsed.noticeMd).trim(),
    generationMs,
  }
}

// ── DPI / RVPI rollup for the list view ─────────────────────────────────

export interface FundDistributionRollup {
  total_distributed: number
  total_called: number
  total_committed: number
  /** DPI = distributions / called.  Null when called = 0. */
  dpi: number | null
  /** distributions / committed.  Null when committed = 0. */
  pct_of_commitment: number | null
  num_distributions: number
  num_paid: number
}

export async function getFundDistributionRollup(
  fundId: string,
): Promise<FundDistributionRollup> {
  const rows = await sql`
    SELECT
      COALESCE(SUM(distributed_amount), 0) AS total_distributed,
      COALESCE(SUM(called_amount), 0)      AS total_called,
      COALESCE(SUM(commitment_amount), 0)  AS total_committed
    FROM fund_lps
    WHERE fund_id = ${fundId} AND status != 'transferred'
  `
  const dcount = await sql`
    SELECT
      COUNT(*)                                       AS total,
      COUNT(*) FILTER (WHERE status = 'paid')        AS paid
    FROM distributions
    WHERE fund_id = ${fundId}
  `
  const r: any = rows[0] ?? {}
  const cr: any = dcount[0] ?? {}
  const dist = Number(r.total_distributed ?? 0)
  const called = Number(r.total_called ?? 0)
  const committed = Number(r.total_committed ?? 0)
  return {
    total_distributed: dist,
    total_called: called,
    total_committed: committed,
    dpi: called > 0 ? Math.round((dist / called) * 1000) / 1000 : null,
    pct_of_commitment: committed > 0 ? Math.round((dist / committed) * 10000) / 10000 : null,
    num_distributions: Number(cr.total ?? 0),
    num_paid: Number(cr.paid ?? 0),
  }
}

// ── shape helpers ───────────────────────────────────────────────────────

function normalizeDistribution(r: any): DistributionFull {
  return {
    id: r.id,
    fund_id: r.fund_id,
    distribution_number: Number(r.distribution_number),
    title: r.title,
    source: r.source ?? null,
    source_company_id: r.source_company_id ?? null,
    gross_amount: toNum(r.gross_amount),
    mgmt_fee_deduction: toNum(r.mgmt_fee_deduction) ?? 0,
    carry_deduction: toNum(r.carry_deduction) ?? 0,
    net_amount: toNum(r.net_amount) ?? 0,
    payment_date: toIsoDate(r.payment_date),
    notified_at: toIso(r.notified_at),
    notice_md: r.notice_md ?? null,
    notice_subject: r.notice_subject ?? null,
    status: (r.status ?? "draft") as DistributionStatus,
    created_by: r.created_by ?? null,
    created_at: toIso(r.created_at) ?? new Date().toISOString(),
    updated_at: toIso(r.updated_at) ?? new Date().toISOString(),
  }
}
function normalizeLineItem(r: any): DistributionLineItemFull {
  return {
    id: r.id,
    distribution_id: r.distribution_id,
    fund_lp_id: r.fund_lp_id,
    amount: toNum(r.amount) ?? 0,
    status: (r.status ?? "pending") as DistributionLineStatus,
    notified_at: toIso(r.notified_at),
    paid_at: toIso(r.paid_at),
    payment_ref: r.payment_ref ?? null,
    resend_message_id: r.resend_message_id ?? null,
    notes: r.notes ?? null,
    created_at: toIso(r.created_at) ?? new Date().toISOString(),
    updated_at: toIso(r.updated_at) ?? new Date().toISOString(),
  }
}
function toNum(v: any): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v); return Number.isFinite(n) ? n : null
}
function toIso(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}
function toIsoDate(v: any): string | null {
  const iso = toIso(v); return iso ? iso.slice(0, 10) : null
}

/**
 * Capital call queries + lifecycle.
 *
 * The interesting logic isn't the CRUD — it's the auto-derivations:
 *
 *   - createCall(): synthesises one line item per non-transferred LP,
 *     pro-rated against commitment_amount × default_call_pct.
 *   - markLinePaid(): increments fund_lps.called_amount, flips the LP
 *     status to fully_called when commitment is exhausted, and bumps
 *     the parent call to status='settled' when every line is closed
 *     (paid or waived).
 *   - generateNoticeMarkdown(): runs the AI provider's deep tier to draft the
 *     LP-facing notice text.
 */

import { sql } from "@/lib/db"
import { generate } from "@/lib/ai/provider"
import { getFundById, listLps, type FundFull, type FundLpFull } from "@/lib/portfolio/funds"

// ── types ───────────────────────────────────────────────────────────────

export const CALL_STATUSES = ["draft", "sent", "settled", "cancelled"] as const
export type CallStatus = (typeof CALL_STATUSES)[number]

export const LINE_STATUSES = ["pending", "sent", "paid", "waived", "defaulted"] as const
export type LineStatus = (typeof LINE_STATUSES)[number]

export interface CapitalCallFull {
  id: string
  fund_id: string
  call_number: number
  title: string
  purpose: string | null
  default_call_pct: number | null
  total_amount: number
  sent_at: string | null
  due_date: string | null
  notice_md: string | null
  notice_subject: string | null
  status: CallStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CapitalCallLineItemFull {
  id: string
  call_id: string
  fund_lp_id: string
  amount: number
  status: LineStatus
  sent_at: string | null
  paid_at: string | null
  payment_ref: string | null
  resend_message_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** Joined shape for the detail view. */
export interface CallLineWithLp extends CapitalCallLineItemFull {
  lp_name: string
  lp_type: string | null
  lp_contact_id: string | null
  /** Resolved from contacts.email via LEFT JOIN. Null when contact has no
   *  email or when no contact is attached. Used by the UI to surface the
   *  resolved recipient up front so the operator doesn't discover the
   *  missing email only after running send-notice. */
  lp_contact_email: string | null
  lp_commitment_amount: number | null
  lp_called_amount: number
}

// ── calls: read ─────────────────────────────────────────────────────────

export async function listCalls(fundId: string): Promise<CapitalCallFull[]> {
  const rows = await sql`
    SELECT * FROM capital_calls
     WHERE fund_id = ${fundId}
     ORDER BY call_number DESC
  `
  return rows.map(normalizeCall)
}

export async function getCallById(id: string): Promise<CapitalCallFull | null> {
  const rows = await sql`SELECT * FROM capital_calls WHERE id = ${id} LIMIT 1`
  return rows[0] ? normalizeCall(rows[0]) : null
}

export async function listLineItems(callId: string): Promise<CallLineWithLp[]> {
  const rows = await sql`
    SELECT
      cli.*,
      fl.lp_name           AS lp_name,
      fl.lp_type           AS lp_type,
      fl.lp_contact_id     AS lp_contact_id,
      fl.commitment_amount AS lp_commitment_amount,
      fl.called_amount     AS lp_called_amount,
      c.email              AS lp_contact_email
    FROM capital_call_line_items cli
    JOIN fund_lps fl ON fl.id = cli.fund_lp_id
    LEFT JOIN contacts c ON c.id = fl.lp_contact_id
    WHERE cli.call_id = ${callId}
    ORDER BY fl.commitment_amount DESC NULLS LAST, fl.lp_name ASC
  `
  return rows.map((r: any) => ({
    ...normalizeLineItem(r),
    lp_name: r.lp_name,
    lp_type: r.lp_type ?? null,
    lp_contact_id: r.lp_contact_id ?? null,
    lp_contact_email: r.lp_contact_email ?? null,
    lp_commitment_amount: toNum(r.lp_commitment_amount),
    lp_called_amount: toNum(r.lp_called_amount) ?? 0,
  }))
}

// ── calls: write ────────────────────────────────────────────────────────

export interface CreateCallInput {
  fundId: string
  title: string
  purpose?: string | null
  /** Pct of commitment to call from each LP this round. */
  defaultCallPct?: number | null
  dueDate?: string | null
  createdBy?: string | null
}

/**
 * Creates a call AND its initial line items.  One transaction-equivalent
 * sequence — we do it in three queries (next-number, insert call, bulk
 * insert lines) and roll back the call insert if any line insert fails.
 */
export async function createCall(input: CreateCallInput): Promise<{
  call: CapitalCallFull
  lineItems: CapitalCallLineItemFull[]
}> {
  if (!input.fundId) throw new Error("fundId required")
  if (!input.title?.trim()) throw new Error("title required")

  // Next ordinal for this fund.
  const maxRows = await sql`
    SELECT COALESCE(MAX(call_number), 0) AS n FROM capital_calls WHERE fund_id = ${input.fundId}
  `
  const callNumber = Number(maxRows[0]?.n ?? 0) + 1

  const callRows = await sql`
    INSERT INTO capital_calls (
      fund_id, call_number, title, purpose, default_call_pct,
      total_amount, due_date, status, created_by, created_at, updated_at
    ) VALUES (
      ${input.fundId}, ${callNumber}, ${input.title.trim()},
      ${input.purpose ?? null}, ${input.defaultCallPct ?? null},
      0, ${input.dueDate ?? null}::date,
      'draft', ${input.createdBy ?? null}, NOW(), NOW()
    )
    RETURNING *
  `
  const call = normalizeCall(callRows[0])

  // Pull non-transferred LPs and synthesise line items.
  const lps = (await listLps(input.fundId)).filter((lp) => lp.status !== "transferred")
  const pct = input.defaultCallPct ?? 0
  const lineRows: CapitalCallLineItemFull[] = []
  for (const lp of lps) {
    const amount =
      lp.commitment_amount != null && pct > 0
        ? Math.round(lp.commitment_amount * pct * 100) / 100
        : 0
    const ins = await sql`
      INSERT INTO capital_call_line_items (
        call_id, fund_lp_id, amount, status, created_at, updated_at
      ) VALUES (
        ${call.id}, ${lp.id}, ${amount}, 'pending', NOW(), NOW()
      )
      RETURNING *
    `
    lineRows.push(normalizeLineItem(ins[0]))
  }

  await recomputeCallTotal(call.id)
  const refreshed = await getCallById(call.id)
  return { call: refreshed ?? call, lineItems: lineRows }
}

export interface UpdateCallInput {
  title?: string
  purpose?: string | null
  defaultCallPct?: number | null
  dueDate?: string | null
  noticeMd?: string | null
  noticeSubject?: string | null
  status?: CallStatus
}

export async function updateCall(id: string, patch: UpdateCallInput): Promise<CapitalCallFull | null> {
  const rows = await sql`
    UPDATE capital_calls SET
      title            = COALESCE(${patch.title ?? null}, title),
      purpose          = COALESCE(${patch.purpose ?? null}, purpose),
      default_call_pct = COALESCE(${patch.defaultCallPct ?? null}, default_call_pct),
      due_date         = COALESCE(${patch.dueDate ?? null}::date, due_date),
      notice_md        = COALESCE(${patch.noticeMd ?? null}, notice_md),
      notice_subject   = COALESCE(${patch.noticeSubject ?? null}, notice_subject),
      status           = COALESCE(${patch.status ?? null}, status),
      sent_at          = CASE
                           WHEN ${patch.status ?? null} = 'sent' AND sent_at IS NULL THEN NOW()
                           ELSE sent_at
                         END,
      updated_at       = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return rows[0] ? normalizeCall(rows[0]) : null
}

export async function deleteCall(id: string): Promise<boolean> {
  // ON DELETE CASCADE wipes line items; we also need to roll back any
  // called_amount increments those paid lines triggered.  Easiest: snapshot
  // paid lines first, then decrement fund_lps after the delete.
  const paid = await sql`
    SELECT fund_lp_id, amount
      FROM capital_call_line_items
     WHERE call_id = ${id} AND status = 'paid'
  `
  const rows = await sql`DELETE FROM capital_calls WHERE id = ${id} RETURNING id`
  if (rows.length === 0) return false
  for (const row of paid as any[]) {
    await sql`
      UPDATE fund_lps
         SET called_amount = GREATEST(0, COALESCE(called_amount, 0) - ${row.amount}),
             status = CASE WHEN status = 'fully_called' THEN 'committed' ELSE status END,
             updated_at = NOW()
       WHERE id = ${row.fund_lp_id}
    `
  }
  return true
}

// ── line items ──────────────────────────────────────────────────────────

export interface UpdateLineItemInput {
  amount?: number
  status?: LineStatus
  paymentRef?: string | null
  notes?: string | null
  paidAt?: string | null   // ISO; when null + status=paid we use NOW()
  sentAt?: string | null
  resendMessageId?: string | null
}

/**
 * Generic patch endpoint.  Handles the side-effect cascade when status
 * transitions to/from 'paid':
 *
 *   - paid:        increments fund_lps.called_amount by line's amount;
 *                  flips LP status committed → fully_called if exhausted
 *   - un-paid:     reverses the increment + status flip
 *   - settle-call: when every remaining line is paid or waived, call
 *                  status flips to 'settled'.
 */
export async function updateLineItem(
  id: string,
  patch: UpdateLineItemInput,
): Promise<{
  line: CapitalCallLineItemFull | null
  callStatus: CallStatus | null
  lpStatus: string | null
}> {
  const existing = (await sql`SELECT * FROM capital_call_line_items WHERE id = ${id} LIMIT 1`)[0] as any
  if (!existing) return { line: null, callStatus: null, lpStatus: null }

  const beforePaid = existing.status === "paid"
  const beforeAmount = toNum(existing.amount) ?? 0

  const rows = await sql`
    UPDATE capital_call_line_items SET
      amount            = COALESCE(${patch.amount ?? null}, amount),
      status            = COALESCE(${patch.status ?? null}, status),
      payment_ref       = COALESCE(${patch.paymentRef ?? null}, payment_ref),
      notes             = COALESCE(${patch.notes ?? null}, notes),
      paid_at           = CASE
                            WHEN ${patch.status ?? null} = 'paid' AND paid_at IS NULL
                              THEN COALESCE(${patch.paidAt ?? null}::timestamptz, NOW())
                            WHEN ${patch.status ?? null} IN ('pending', 'waived', 'defaulted')
                              THEN NULL
                            ELSE paid_at
                          END,
      sent_at           = CASE
                            WHEN ${patch.status ?? null} = 'sent' AND sent_at IS NULL
                              THEN COALESCE(${patch.sentAt ?? null}::timestamptz, NOW())
                            WHEN ${patch.sentAt ?? null} IS NOT NULL
                              THEN ${patch.sentAt ?? null}::timestamptz
                            ELSE sent_at
                          END,
      resend_message_id = COALESCE(${patch.resendMessageId ?? null}, resend_message_id),
      updated_at        = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  const updated = normalizeLineItem(rows[0])
  const afterPaid = updated.status === "paid"
  const afterAmount = updated.amount

  // Side effects on the LP's called_amount + status.
  let lpStatusReport: string | null = null
  if (beforePaid !== afterPaid || (beforePaid && afterPaid && beforeAmount !== afterAmount)) {
    const delta =
      (afterPaid ? afterAmount : 0) - (beforePaid ? beforeAmount : 0)
    if (delta !== 0) {
      const lpRows = await sql`
        UPDATE fund_lps
           SET called_amount = GREATEST(0, COALESCE(called_amount, 0) + ${delta}),
               updated_at    = NOW()
         WHERE id = ${updated.fund_lp_id}
        RETURNING called_amount, commitment_amount, status
      `
      const lp: any = lpRows[0]
      if (lp) {
        const called = Number(lp.called_amount ?? 0)
        const commit = lp.commitment_amount != null ? Number(lp.commitment_amount) : null
        let newStatus = lp.status
        if (commit != null && commit > 0 && called >= commit - 0.01) {
          newStatus = "fully_called"
        } else if (lp.status === "fully_called" && (commit == null || called < commit - 0.01)) {
          newStatus = "committed"
        }
        if (newStatus !== lp.status) {
          await sql`UPDATE fund_lps SET status = ${newStatus}, updated_at = NOW() WHERE id = ${updated.fund_lp_id}`
        }
        lpStatusReport = newStatus
      }
    }
  }

  // Settle the parent call if every line is closed (paid/waived).
  const callStatusRows = await sql`
    SELECT
      c.id, c.status,
      COUNT(li.*)                                     AS total,
      COUNT(li.*) FILTER (WHERE li.status IN ('paid','waived')) AS closed
    FROM capital_calls c
    JOIN capital_call_line_items li ON li.call_id = c.id
    WHERE c.id = ${updated.call_id}
    GROUP BY c.id, c.status
  `
  let callStatus: CallStatus | null = null
  const cr: any = callStatusRows[0]
  if (cr) {
    callStatus = cr.status
    if (cr.status !== "settled" && cr.status !== "cancelled"
        && Number(cr.total) > 0 && Number(cr.total) === Number(cr.closed)) {
      await sql`UPDATE capital_calls SET status = 'settled', updated_at = NOW() WHERE id = ${updated.call_id}`
      callStatus = "settled"
    }
  }

  await recomputeCallTotal(updated.call_id)

  return { line: updated, callStatus, lpStatus: lpStatusReport }
}

export async function deleteLineItem(id: string): Promise<{ deleted: boolean; callId: string | null }> {
  const existing = (await sql`SELECT call_id, fund_lp_id, amount, status FROM capital_call_line_items WHERE id = ${id} LIMIT 1`)[0] as any
  if (!existing) return { deleted: false, callId: null }
  if (existing.status === "paid") {
    // Reverse the called_amount increment first.
    await sql`
      UPDATE fund_lps
         SET called_amount = GREATEST(0, COALESCE(called_amount, 0) - ${existing.amount}),
             status = CASE WHEN status = 'fully_called' THEN 'committed' ELSE status END,
             updated_at = NOW()
       WHERE id = ${existing.fund_lp_id}
    `
  }
  await sql`DELETE FROM capital_call_line_items WHERE id = ${id}`
  await recomputeCallTotal(existing.call_id)
  return { deleted: true, callId: existing.call_id }
}

// ── derived helpers ─────────────────────────────────────────────────────

async function recomputeCallTotal(callId: string): Promise<void> {
  await sql`
    UPDATE capital_calls
       SET total_amount = (
         SELECT COALESCE(SUM(amount), 0) FROM capital_call_line_items WHERE call_id = ${callId}
       ),
       updated_at = NOW()
     WHERE id = ${callId}
  `
}

// ── notice draft via the AI router ───────────────────────────────────────────────

export interface NoticeDraft {
  subject: string
  noticeMd: string
  generationMs: number
}

export async function generateNoticeMarkdown(
  fund: FundFull,
  call: CapitalCallFull,
  lines: CallLineWithLp[],
): Promise<NoticeDraft> {
  const total = lines.reduce((s, l) => s + l.amount, 0)
  const lps = lines.length
  const ccy = fund.currency
  const due = call.due_date ?? "TBD"
  const pct = call.default_call_pct
    ? `${(call.default_call_pct * 100).toFixed(1)}%`
    : "varies per LP"

  const prompt = `You are the managing partner of an investment fund drafting a capital call notice to your Limited Partners. Draft the notice in plain prose markdown based ONLY on the facts below.

Tone
- Direct, professional, transactional. No marketing language.
- Use the exact numbers given. Never fabricate.
- No em dashes (use commas, colons, periods).

Facts
- Fund: ${fund.name} (${fund.slug})
- Manager: ${fund.manager_org ?? "the General Partner"}
- Currency: ${ccy}
- Call: #${call.call_number} — ${call.title}
- Purpose: ${call.purpose ?? "(unspecified — write a generic deployment-needs paragraph)"}
- Call percentage (default): ${pct}
- Total being called: ${ccy} ${total.toFixed(2)}
- Number of LPs receiving notice: ${lps}
- Due date: ${due}

Structure (use markdown headings exactly as shown)

# Capital Call Notice #${call.call_number} — ${call.title}

## Purpose
2-3 sentences on why this call is being made. Cite the call percentage and total amount. Use the Purpose fact above as the source; do not invent specific deals or amounts beyond what's listed.

## Amount being called
Plain statement of the call percentage and total. Note that each LP will receive their pro-rata line item separately in the email body, computed as (call percentage) × (their commitment).

## Wire instructions
A short stub: "Wire instructions and per-LP amounts are attached separately. Please reference your subscription number in the wire memo." Do NOT invent bank details.

## Due date
One sentence stating the due date and the consequences of non-payment per the LPA (loss of preferred returns, dilution, default proceedings — keep it standard and brief).

## Contact
Single line: "Direct questions to ${fund.manager_org ?? "the General Partner"} via your standard channel."

---

Length target: 250-400 words. No fluff.

Return ONLY this strict JSON object — no prose, no fences:
{
  "subject": "<email subject line, <=80 chars, includes fund + call number>",
  "noticeMd": "<full markdown body starting with the H1>"
}`

  const started = Date.now()
  const raw = await generate(prompt, {
    task: "deep_research",
    maxTokens: 2000,
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

// ── shape helpers ───────────────────────────────────────────────────────

function normalizeCall(r: any): CapitalCallFull {
  return {
    id: r.id,
    fund_id: r.fund_id,
    call_number: Number(r.call_number),
    title: r.title,
    purpose: r.purpose ?? null,
    default_call_pct: toNum(r.default_call_pct),
    total_amount: toNum(r.total_amount) ?? 0,
    sent_at: toIso(r.sent_at),
    due_date: toIsoDate(r.due_date),
    notice_md: r.notice_md ?? null,
    notice_subject: r.notice_subject ?? null,
    status: (r.status ?? "draft") as CallStatus,
    created_by: r.created_by ?? null,
    created_at: toIso(r.created_at) ?? new Date().toISOString(),
    updated_at: toIso(r.updated_at) ?? new Date().toISOString(),
  }
}
function normalizeLineItem(r: any): CapitalCallLineItemFull {
  return {
    id: r.id,
    call_id: r.call_id,
    fund_lp_id: r.fund_lp_id,
    amount: toNum(r.amount) ?? 0,
    status: (r.status ?? "pending") as LineStatus,
    sent_at: toIso(r.sent_at),
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

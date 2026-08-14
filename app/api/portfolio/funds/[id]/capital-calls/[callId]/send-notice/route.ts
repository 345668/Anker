/**
 * POST /api/portfolio/funds/[id]/capital-calls/[callId]/send-notice
 *
 *   Body: { lineItemIds?: string[], dryRun?: boolean }
 *     - lineItemIds: when present, only sends to these LPs (defaults to
 *       every pending line item with a resolvable contact email).
 *     - dryRun: builds + returns the per-LP email payloads but doesn't
 *       call Resend; useful for previewing before pulling the trigger.
 *
 * For each line item we attempt to:
 *   1. Resolve the LP's contact email via fund_lps.lp_contact_id → contacts.email.
 *   2. Render the call's notice_md as HTML via the newsroom renderer, then
 *      prepend a one-line "Your line item: {ccy} {amount}" header.
 *   3. Send via Resend (lib/email/resend.ts sendEmail).
 *   4. Update the line item: status='sent', sent_at=NOW(), resend_message_id.
 *
 * If we don't have a contact email or Resend isn't configured, the line
 * item is reported as 'skipped' in the response — no DB write — so the
 * caller can show the operator who needs a manual notice.
 *
 * On success the parent call's status flips to 'sent' (sent_at stamped)
 * when at least one line item actually shipped.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById } from "@/lib/portfolio/funds"
import {
  getCallById, listLineItems, updateLineItem, updateCall,
} from "@/lib/portfolio/capital-calls"
import { sendEmail, isResendConfigured } from "@/lib/email/resend"
import { renderArticleHtml } from "@/lib/newsroom/markdown"
import { renderNoticePdf, toBase64 } from "@/lib/portfolio/notice-pdf"

const money = (ccy: string, v: number) => `${ccy} ${Math.round(v).toLocaleString("en-US")}`

export const runtime = "nodejs"
export const maxDuration = 240

interface SendResult {
  lineItemId: string
  lpName: string
  status: "sent" | "skipped"
  reason?: string
  to?: string
  amount?: number
  resendId?: string
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; callId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { callId } = await ctx.params

  let body: any = {}
  try { body = await req.json() } catch {}
  const onlyIds: string[] | null = Array.isArray(body?.lineItemIds) ? body.lineItemIds : null
  const dryRun = !!body?.dryRun

  const call = await getCallById(callId)
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 })
  if (!call.notice_md || !call.notice_subject) {
    return NextResponse.json({
      error: "Call has no notice — draft one via POST /draft-notice first, or set notice_md + notice_subject manually.",
    }, { status: 400 })
  }
  const fund = await getFundById(call.fund_id)
  if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 })

  const allLines = await listLineItems(callId)
  const targets = (onlyIds
    ? allLines.filter((l) => onlyIds.includes(l.id))
    : allLines.filter((l) => l.status === "pending")
  )

  if (targets.length === 0) {
    return NextResponse.json({
      error: onlyIds
        ? "None of the supplied lineItemIds matched this call."
        : "No pending line items to notice on.",
    }, { status: 400 })
  }

  // Contact emails are joined into listLineItems via the LEFT JOIN on
  // contacts.id = fund_lps.lp_contact_id, so we don't need a second
  // round-trip — just read line.lp_contact_email.

  const noticeHtmlBase = renderArticleHtml(call.notice_md)
  const noticeSubject = call.notice_subject
  const wantSend = !dryRun && isResendConfigured()
  if (!dryRun && !isResendConfigured()) {
    return NextResponse.json({
      error: "RESEND_API_KEY not set on server. Set the env var, or pass dryRun=true to preview the per-LP payloads.",
    }, { status: 503 })
  }

  const out: SendResult[] = []
  for (const line of targets) {
    const lpEmail = line.lp_contact_email ?? undefined
    if (!lpEmail) {
      out.push({
        lineItemId: line.id,
        lpName: line.lp_name,
        status: "skipped",
        reason: line.lp_contact_id
          ? "Contact row has no email on file"
          : "LP has no contact attached — add lp_contact_id on the fund_lps row",
        amount: line.amount,
      })
      continue
    }

    // Per-LP injection above the shared notice body.
    const headerHtml = `
      <table style="width:100%; border-collapse:collapse; margin:0 0 24px 0; border:1px solid #e5e7eb; border-radius:8px;">
        <tr>
          <td style="padding:14px 18px; background:#f9fafb; border-bottom:1px solid #e5e7eb;">
            <div style="font-family:ui-monospace,Menlo,monospace; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:#6b7280;">Your line item</div>
            <div style="font-family:Georgia,serif; font-size:22px; margin-top:4px; color:#111827;">
              ${fund.currency} ${line.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </div>
            <div style="font-family:ui-monospace,Menlo,monospace; font-size:11px; color:#6b7280; margin-top:4px;">
              ${line.lp_name} · Call #${call.call_number} · ${call.title}
            </div>
          </td>
        </tr>
      </table>
    `
    const html = `<div style="max-width:640px; margin:0 auto; padding:24px 20px; font-family:ui-sans-serif,-apple-system,sans-serif; color:#111827; line-height:1.55;">
      ${headerHtml}
      ${noticeHtmlBase}
    </div>`
    const text = `${line.lp_name} — Your line item: ${fund.currency} ${line.amount.toFixed(2)}\n\n${call.notice_md}`

    if (dryRun) {
      out.push({
        lineItemId: line.id,
        lpName: line.lp_name,
        status: "sent",
        reason: "dryRun — not actually emailed",
        to: lpEmail,
        amount: line.amount,
      })
      continue
    }

    // Per-LP PDF notice (Carta-style). Best-effort — a render failure must
    // not block the email, so we swallow and send without the attachment.
    let attachments: { filename: string; content: string }[] | undefined
    try {
      const postCalled = line.lp_called_amount + line.amount
      const remaining = line.lp_commitment_amount != null ? Math.max(0, line.lp_commitment_amount - postCalled) : null
      const pdf = await renderNoticePdf({
        fundName: fund.name,
        kind: "Capital Call Notice",
        lpName: line.lp_name,
        noticeDate: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        meta: [
          { label: "Initiated by", value: fund.name },
          { label: "Date of notice", value: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) },
          { label: "Due date", value: call.due_date ? new Date(call.due_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—" },
        ],
        detailRows: [
          { label: "Contribution", value: money(fund.currency, line.amount) },
          { label: "Amount due to fund", value: money(fund.currency, line.amount), bold: true },
        ],
        summaryRows: [
          { label: "Commitment", value: line.lp_commitment_amount != null ? money(fund.currency, line.lp_commitment_amount) : "—" },
          { label: "Called capital (post call)", value: money(fund.currency, postCalled) },
          { label: "Remaining uncalled commitment (post call)", value: remaining != null ? money(fund.currency, remaining) : "—" },
        ],
        purpose: call.purpose ?? null,
      })
      attachments = [{ filename: `Capital-Call-${call.call_number}-${line.lp_name.replace(/[^a-z0-9]+/gi, "-")}.pdf`, content: toBase64(pdf) }]
    } catch { /* send without PDF */ }

    try {
      const result = await sendEmail({
        to: lpEmail,
        subject: noticeSubject,
        html,
        text,
        // System / transactional — don't pixel-track LP notices.
        noTracking: true,
        attachments,
      })
      await updateLineItem(line.id, {
        status: "sent",
        resendMessageId: result.resendId,
      })
      out.push({
        lineItemId: line.id,
        lpName: line.lp_name,
        status: "sent",
        to: lpEmail,
        amount: line.amount,
        resendId: result.resendId,
      })
    } catch (e: any) {
      out.push({
        lineItemId: line.id,
        lpName: line.lp_name,
        status: "skipped",
        reason: `send failed: ${e?.message ?? "unknown error"}`,
        to: lpEmail,
        amount: line.amount,
      })
    }
  }

  // If at least one line shipped (not dryRun, not skipped), promote call status.
  const shippedCount = out.filter((r) => r.status === "sent" && !r.reason?.startsWith("dryRun")).length
  if (shippedCount > 0 && call.status === "draft") {
    await updateCall(callId, { status: "sent" })
  }

  return NextResponse.json({
    dryRun,
    callId,
    attempted: targets.length,
    sent: out.filter((r) => r.status === "sent" && !r.reason).length,
    skipped: out.filter((r) => r.status === "skipped").length,
    results: out,
  })
}

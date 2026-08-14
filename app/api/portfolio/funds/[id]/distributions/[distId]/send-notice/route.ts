/**
 * POST /api/portfolio/funds/[id]/distributions/[distId]/send-notice
 *
 *   Body: { lineItemIds?: string[], dryRun?: boolean }
 *
 * Same shape and semantics as the capital-call send-notice route — the
 * only differences are the table the line items live in and the per-LP
 * card header ("Your distribution" instead of "Your line item"). We
 * deliberately keep the two flows separate (instead of generalising
 * over a "notice" interface) because the email copy + lifecycle
 * semantics diverge over time.
 *
 * On send: flips matching line items to 'notified', stamps
 * resend_message_id, and promotes the parent distribution status from
 * 'draft' to 'notified' if any line shipped.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById } from "@/lib/portfolio/funds"
import {
  getDistributionById, listDistributionLineItems,
  updateDistributionLineItem, updateDistribution,
} from "@/lib/portfolio/distributions"
import { sendEmail, isResendConfigured } from "@/lib/email/resend"
import { renderNoticePdf, toBase64 } from "@/lib/portfolio/notice-pdf"

const money = (ccy: string, v: number) => `${ccy} ${Math.round(v).toLocaleString("en-US")}`
import { renderArticleHtml } from "@/lib/newsroom/markdown"

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
  ctx: { params: Promise<{ id: string; distId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { distId } = await ctx.params

  let body: any = {}
  try { body = await req.json() } catch {}
  const onlyIds: string[] | null = Array.isArray(body?.lineItemIds) ? body.lineItemIds : null
  const dryRun = !!body?.dryRun

  const dist = await getDistributionById(distId)
  if (!dist) return NextResponse.json({ error: "Distribution not found" }, { status: 404 })
  if (!dist.notice_md || !dist.notice_subject) {
    return NextResponse.json({
      error: "Distribution has no notice — draft one via /draft-notice first, or set notice_md + notice_subject manually.",
    }, { status: 400 })
  }
  const fund = await getFundById(dist.fund_id)
  if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 })

  const allLines = await listDistributionLineItems(distId)
  const targets = (onlyIds
    ? allLines.filter((l) => onlyIds.includes(l.id))
    : allLines.filter((l) => l.status === "pending")
  )
  if (targets.length === 0) {
    return NextResponse.json({
      error: onlyIds
        ? "None of the supplied lineItemIds matched this distribution."
        : "No pending line items to notice on.",
    }, { status: 400 })
  }

  // Contact emails join in via listDistributionLineItems — no extra query needed.

  const noticeHtmlBase = renderArticleHtml(dist.notice_md)
  const subject = dist.notice_subject

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

    const headerHtml = `
      <table style="width:100%; border-collapse:collapse; margin:0 0 24px 0; border:1px solid #d1fae5; border-radius:8px; background:#ecfdf5;">
        <tr>
          <td style="padding:14px 18px; border-bottom:1px solid #d1fae5;">
            <div style="font-family:ui-monospace,Menlo,monospace; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:#047857;">Your distribution</div>
            <div style="font-family:Georgia,serif; font-size:22px; margin-top:4px; color:#065f46;">
              ${fund.currency} ${line.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </div>
            <div style="font-family:ui-monospace,Menlo,monospace; font-size:11px; color:#047857; margin-top:4px;">
              ${line.lp_name} · Distribution #${dist.distribution_number} · ${dist.title}
            </div>
            ${line.lp_ownership_pct != null
              ? `<div style="font-family:ui-monospace,Menlo,monospace; font-size:10px; color:#065f46; margin-top:2px;">
                   Computed at ${(line.lp_ownership_pct * 100).toFixed(2)}% ownership share
                 </div>`
              : ""}
          </td>
        </tr>
      </table>
    `
    const html = `<div style="max-width:640px; margin:0 auto; padding:24px 20px; font-family:ui-sans-serif,-apple-system,sans-serif; color:#111827; line-height:1.55;">
      ${headerHtml}
      ${noticeHtmlBase}
    </div>`
    const text = `${line.lp_name} — Your distribution: ${fund.currency} ${line.amount.toFixed(2)}\n\n${dist.notice_md}`

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

    let attachments: { filename: string; content: string }[] | undefined
    try {
      const noticeDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      const pdf = await renderNoticePdf({
        fundName: fund.name,
        kind: "Distribution Notice",
        lpName: line.lp_name,
        noticeDate,
        meta: [
          { label: "Initiated by", value: fund.name },
          { label: "Date of notice", value: noticeDate },
          { label: "Payment date", value: dist.payment_date ? new Date(dist.payment_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—" },
        ],
        detailRows: [
          { label: "Distribution", value: dist.title },
          { label: "Amount to you", value: money(fund.currency, line.amount), bold: true },
        ],
        summaryRows: [
          { label: "Commitment", value: line.lp_commitment_amount != null ? money(fund.currency, line.lp_commitment_amount) : "—" },
          { label: "Distributed to date (post)", value: money(fund.currency, line.lp_distributed_amount + line.amount) },
        ],
        purpose: dist.source ?? null,
      })
      attachments = [{ filename: `Distribution-${dist.distribution_number}-${line.lp_name.replace(/[^a-z0-9]+/gi, "-")}.pdf`, content: toBase64(pdf) }]
    } catch { /* send without PDF */ }

    try {
      const result = await sendEmail({
        to: lpEmail,
        subject,
        html,
        text,
        noTracking: true,
        attachments,
      })
      await updateDistributionLineItem(line.id, {
        status: "notified",
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

  const shippedCount = out.filter((r) => r.status === "sent" && !r.reason?.startsWith("dryRun")).length
  if (shippedCount > 0 && dist.status === "draft") {
    await updateDistribution(distId, { status: "notified" })
  }

  return NextResponse.json({
    dryRun,
    distributionId: distId,
    attempted: targets.length,
    sent: out.filter((r) => r.status === "sent" && !r.reason).length,
    skipped: out.filter((r) => r.status === "skipped").length,
    results: out,
  })
}

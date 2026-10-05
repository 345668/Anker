import { crmWorkspaceResponse } from "@/lib/crm/workspace"
/**
 * POST /api/outreach/campaigns/[id]/send
 *
 * Human-gated bulk send for a campaign's drafted members.
 * Calls the existing /api/outreach/send-email logic per message row.
 *
 * Body: { memberIds?: string[] }   — omit to send all drafted members
 *
 * Returns:
 *   { sent: number, failed: number, skipped: number, results: SendResult[] }
 *
 * Rules (from outreach playbook):
 *   - Only sends messages with status = 'draft' | 'approved' | 'queued'
 *   - Only sends channel = 'email' (LinkedIn DMs need manual copy-paste)
 *   - 150ms gap between sends to respect Resend rate limits
 *   - Updates outreach_campaign_members.status → 'sent'
 *   - Updates outreach_campaign_members.sent_at
 *   - Triggers CRM stage sync via syncCrmStageFromOutreach
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { sendEmail, isResendConfigured } from "@/lib/email/resend"
import { sendGmail, loadGmailAccount, isGmailOAuthConfigured } from "@/lib/email/gmail"
import { syncCrmStageFromOutreach } from "@/lib/agents/crm-sync"
import { randomUUID } from "node:crypto"
import { parseBulkSelection, checkCount } from "@/lib/outreach/bulk-selection"
import { buildPreview } from "@/lib/outreach/send-auth/preview"
import { confirmAuthorization, authorizationItems, AuthorizationError } from "@/lib/outreach/send-auth/store"
import { runExecutor } from "@/lib/outreach/send-auth/executor"
import { VERDICT_TEXT } from "@/lib/outreach/send-auth/model"
import { recordChange } from "@/lib/audit/record-change"

export const runtime = "nodejs"
export const maxDuration = 300

interface SendResult {
  memberId: string
  messageId: string
  name: string
  email: string
  status: "sent" | "failed" | "skipped" | "queued"
  error?: string
  dryRun?: boolean
  resendId?: string
  dropped?: Array<{ email: string; field: "cc" | "bcc"; reason: "suppressed" | "country_gated" }>
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
    const crmScope = await crmWorkspaceResponse(true, true)
    if (crmScope instanceof NextResponse) return crmScope

    const { id: campaignId } = await ctx.params

    const body = await req.json().catch(() => ({}))
    // A send names its recipients, or says all and the number it saw (lib/outreach/bulk-selection.ts, docs/architecture/46 §1.3).
    const selection = parseBulkSelection(body)
    if (selection.kind === "invalid") return NextResponse.json({ error: selection.error }, { status: 400 })
    const memberIds: string[] | undefined = selection.kind === "explicit" ? selection.ids : undefined

    // Verify campaign ownership + pull cc/bcc + provider settings
    const [campaign] = await sql`
      SELECT id, cc_emails, bcc_emails, default_send_provider, default_send_account_id
      FROM outreach_campaigns
      WHERE id = ${campaignId} AND user_id = ${user.id}
    ` as any[]
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    const campaignCc:  string[] = Array.isArray(campaign.cc_emails)  ? campaign.cc_emails  : []
    const campaignBcc: string[] = Array.isArray(campaign.bcc_emails) ? campaign.bcc_emails : []
    // Body overrides > campaign default > resend
    const bulkProvider: "resend" | "gmail" = body?.provider === "gmail"
      ? "gmail"
      : (body?.provider === "resend" ? "resend" : (campaign.default_send_provider === "gmail" ? "gmail" : "resend"))
    const bulkAccountId: string | null = body?.accountId
      ? String(body.accountId)
      : (campaign.default_send_account_id ?? null)
    let gmailAcct: any = null
    if (bulkProvider === "gmail") {
      if (!isGmailOAuthConfigured()) {
        return NextResponse.json({ error: "Gmail OAuth not configured on this server" }, { status: 503 })
      }
      gmailAcct = bulkAccountId ? await loadGmailAccount({ accountId: bulkAccountId }) : await loadGmailAccount({ userId: user.id })
      if (!gmailAcct) return NextResponse.json({ error: "No Gmail account connected for this user" }, { status: 400 })
      if (gmailAcct.user_id !== user.id) return NextResponse.json({ error: "Forbidden — account belongs to another user" }, { status: 403 })
    }

    // Fetch drafted members + their email outreach_messages
    let memberRows: any[]
    if (memberIds?.length) {
      memberRows = await sql`
        SELECT
          m.id          AS member_id,
          m.crm_entry_id,
          m.status      AS member_status,
          e.display_name,
          e.display_email,
          msg.id        AS msg_id,
          msg.subject,
          msg.body,
          msg.kind,
          msg.channel,
          msg.status    AS msg_status,
          msg.tracking_id,
          msg.email_message_id
        FROM outreach_campaign_members m
        JOIN crm_entries e ON e.id = m.crm_entry_id
        LEFT JOIN outreach_messages msg
          ON msg.crm_entry_id = m.crm_entry_id
          AND msg.user_id     = m.user_id
          AND msg.channel     = 'email'
          AND msg.status NOT IN ('sent','delivered','cancelled')
        WHERE e.org_id = ${crmScope.orgId} AND m.campaign_id = ${campaignId}
          AND m.user_id     = ${user.id}
          AND m.id          = ANY(${memberIds})
        ORDER BY m.added_at ASC
      ` as any[]
    } else {
      memberRows = await sql`
        SELECT
          m.id          AS member_id,
          m.crm_entry_id,
          m.status      AS member_status,
          e.display_name,
          e.display_email,
          msg.id        AS msg_id,
          msg.subject,
          msg.body,
          msg.kind,
          msg.channel,
          msg.status    AS msg_status,
          msg.tracking_id,
          msg.email_message_id
        FROM outreach_campaign_members m
        JOIN crm_entries e ON e.id = m.crm_entry_id
        LEFT JOIN outreach_messages msg
          ON msg.crm_entry_id = m.crm_entry_id
          AND msg.user_id     = m.user_id
          AND msg.channel     = 'email'
          AND msg.status NOT IN ('sent','delivered','cancelled')
        WHERE e.org_id = ${crmScope.orgId} AND m.campaign_id   = ${campaignId}
          AND m.user_id       = ${user.id}
          AND m.status IN ('drafted','planned')
        ORDER BY m.added_at ASC
      ` as any[]
    }

    const tooMany = checkCount(memberRows.length, selection.kind === "all" ? selection.expectedCount : null)
    if (tooMany) return NextResponse.json({ error: tooMany, count: memberRows.length }, { status: 409 })
    if (selection.preview) {
      const sendable = memberRows.filter((r) => String(r.display_email ?? "").trim() && r.msg_id && r.body).length
      return NextResponse.json({ ok: true, preview: true, count: memberRows.length, sendable, skipped: memberRows.length - sendable })
    }

    // Since docs/architecture/46 the send is approved as one batch, previewed, bound to the text, and carried out by the send executor.
    const results: SendResult[] = []
    let sent = 0, failed = 0, skipped = 0
    const candidates: any[] = []
    for (const row of memberRows) {
      const name = String(row.display_name ?? "Investor"), email = String(row.display_email ?? "").trim(), msgId = row.msg_id as string | null
      if (!email) { results.push({ memberId: row.member_id, messageId: msgId ?? "", name, email: "", status: "skipped", error: "No email address" }); skipped++; continue }
      if (!msgId || !row.body) { results.push({ memberId: row.member_id, messageId: msgId ?? "", name, email, status: "skipped", error: "No drafted message — run Draft first" }); skipped++; continue }
      candidates.push(row)
    }
    let authorizationId: string | null = null, waiting = 0
    if (candidates.length) {
      const messageIds = candidates.map((r) => r.msg_id as string)
      const preview = await buildPreview({ orgId: crmScope.orgId, userId: user.id, messageIds, provider: bulkProvider, accountId: bulkAccountId })
      if (preview.error) return NextResponse.json({ error: preview.error }, { status: 409 })
      if (!preview.sendable.length) {
        for (const r of candidates) { const i = preview.items.find((x) => x.messageId === r.msg_id); results.push({ memberId: r.member_id, messageId: r.msg_id, name: String(r.display_name ?? "Investor"), email: String(r.display_email ?? ""), status: "skipped", error: i ? VERDICT_TEXT[i.verdict.code] : "Not sendable" }); skipped++ }
      } else {
        let conf
        try { conf = await confirmAuthorization({ orgId: crmScope.orgId, userId: user.id, messageIds, provider: bulkProvider, accountId: bulkAccountId, digest: preview.digest, typedCount: Number.isInteger(body?.typedCount) ? body.typedCount : undefined, source: "manual_batch" }, { userId: user.id, email: user.email ?? null }) }
        catch (e) { if (e instanceof AuthorizationError) return NextResponse.json({ error: e.message, count: preview.count, needsTypedCount: preview.requiresTypedCount }, { status: e.status }); throw e }
        authorizationId = conf.authorizationId
        await runExecutor(undefined, { authorizationId, max: 100 })
        const items = await authorizationItems(crmScope.orgId, authorizationId)
        for (const r of candidates) {
          const it = items.find((x: any) => x.message_id === r.msg_id)
          const base = { memberId: r.member_id, messageId: r.msg_id as string, name: String(r.display_name ?? "Investor"), email: String(r.display_email ?? "") }
          if (it?.status === "sent") { results.push({ ...base, status: "sent" }); sent++ }
          else if (it?.status === "approved") { results.push({ ...base, status: "queued", error: it.reason ?? "Waiting: it will send within your daily cap." }); waiting++ }
          else if (it?.status === "failed" || it?.status === "unknown") { results.push({ ...base, status: "failed", error: it.reason ?? "Send failed" }); failed++ }
          else { results.push({ ...base, status: "skipped", error: it?.reason ?? "Not sendable" }); skipped++ }
        }
      }
    }
    await recordChange({ actor: { userId: user.id, email: user.email ?? null }, scope: { type: "org", id: crmScope.orgId }, action: "outreach.bulk_send", target: { type: "outreach_campaign", id: campaignId },
      before: null, after: { sent, failed, skipped, waiting, requested: memberRows.length, provider: bulkProvider, authorizationId }, context: { selection: selection.kind } })
    return NextResponse.json({
      ok: failed === 0,
      sent, failed, skipped, waiting, authorizationId,
      note: waiting ? `${waiting} will send as your daily cap allows. You can stop them any time from the authorization.` : null,
      providerConfigured: isResendConfigured(),
      results,
    })
  } catch (e: any) {
    console.error("[campaigns/send] error:", e)
    return NextResponse.json({ error: e?.message ?? "Send failed" }, { status: 500 })
  }
}

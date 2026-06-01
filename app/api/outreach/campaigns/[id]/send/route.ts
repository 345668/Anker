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
import { syncCrmStageFromOutreach } from "@/lib/agents/crm-sync"
import { randomUUID } from "node:crypto"

export const runtime = "nodejs"
export const maxDuration = 300

interface SendResult {
  memberId: string
  messageId: string
  name: string
  email: string
  status: "sent" | "failed" | "skipped"
  error?: string
  dryRun?: boolean
  resendId?: string
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id: campaignId } = await ctx.params

    // Verify campaign ownership
    const [campaign] = await sql`
      SELECT id FROM outreach_campaigns WHERE id = ${campaignId} AND user_id = ${user.id}
    ` as any[]
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

    const body = await req.json().catch(() => ({}))
    const memberIds: string[] | undefined = body?.memberIds

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
        WHERE m.campaign_id = ${campaignId}
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
        WHERE m.campaign_id   = ${campaignId}
          AND m.user_id       = ${user.id}
          AND m.status IN ('drafted','planned')
        ORDER BY m.added_at ASC
      ` as any[]
    }

    const results: SendResult[] = []
    let sent = 0, failed = 0, skipped = 0

    for (const row of memberRows) {
      const name = String(row.display_name ?? "Investor")
      const email = String(row.display_email ?? "").trim()
      const msgId = row.msg_id as string | null

      // Skip if no email address
      if (!email) {
        results.push({ memberId: row.member_id, messageId: msgId ?? "", name, email: "", status: "skipped", error: "No email address" })
        skipped++
        continue
      }

      // Skip if no message drafted
      if (!msgId || !row.body) {
        results.push({ memberId: row.member_id, messageId: msgId ?? "", name, email, status: "skipped", error: "No drafted message — run Draft first" })
        skipped++
        continue
      }

      const subject = String(row.subject ?? "Introduction").trim()

      try {
        // Threading: look up prior connection_request message-id for In-Reply-To
        let inReplyTo: string | undefined
        if (row.kind !== "connection_request" && row.crm_entry_id) {
          const [parent] = await sql`
            SELECT email_message_id FROM outreach_messages
            WHERE crm_entry_id = ${row.crm_entry_id}
              AND kind = 'connection_request'
              AND email_message_id IS NOT NULL
            LIMIT 1
          ` as any[]
          if (parent) inReplyTo = (parent as any).email_message_id || undefined
        }

        const trackingId = (row.tracking_id as string) ?? randomUUID()
        const result = await sendEmail({
          to: email,
          subject,
          text: row.body,
          trackingId,
          inReplyTo,
        })

        // Update outreach_message row
        await sql`
          UPDATE outreach_messages SET
            tracking_id      = ${result.trackingId},
            resend_id        = ${result.resendId},
            email_message_id = ${result.messageId},
            email_from       = ${result.finalFrom},
            email_to         = ${email},
            subject          = ${result.finalSubject},
            status           = 'sent',
            sent_at          = NOW(),
            updated_at       = NOW()
          WHERE id = ${msgId}
        `

        // Update campaign member status
        await sql`
          UPDATE outreach_campaign_members SET
            status   = 'sent',
            sent_at  = NOW(),
            updated_at = NOW()
          WHERE id = ${row.member_id}
        `

        // Sync CRM stage
        try { await syncCrmStageFromOutreach(row.crm_entry_id) } catch {}

        results.push({
          memberId: row.member_id, messageId: msgId, name, email,
          status: "sent", dryRun: result.dryRun, resendId: result.resendId,
        })
        sent++
      } catch (e: any) {
        results.push({ memberId: row.member_id, messageId: msgId, name, email, status: "failed", error: e?.message ?? "Send failed" })
        failed++
      }

      // Rate-limit gap between sends
      await new Promise((r) => setTimeout(r, 150))
    }

    return NextResponse.json({
      ok: failed === 0,
      sent, failed, skipped,
      providerConfigured: isResendConfigured(),
      results,
    })
  } catch (e: any) {
    console.error("[campaigns/send] error:", e)
    return NextResponse.json({ error: e?.message ?? "Send failed" }, { status: 500 })
  }
}

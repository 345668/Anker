/**
 * POST /api/outreach/campaigns/[id]/verify-emails
 *
 * Runs the free local verification pipeline over every SELECTED member
 * with an email. Updates member.email_status + email_quality_reason.
 *
 * Body:  {}  (no config — behavior is fixed)
 *
 * Returns:
 *   { ok, verified, byStatus: { valid, role, format_invalid, no_mx, bounced_june, no_email } }
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { verifyEmails, type EmailStatus } from "@/lib/outreach/email-quality"

export const runtime = "nodejs"
export const maxDuration = 300  // MX lookups can add up on large batches

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const camp = await sql<any[]>`
    SELECT id FROM outreach_campaigns WHERE id = ${campaignId} AND user_id = ${user.id}
  `
  if (!camp.length) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

  // Selected members
  const members = await sql<any[]>`
    SELECT id, email
    FROM outreach_campaign_members
    WHERE campaign_id = ${campaignId} AND user_id = ${user.id} AND selected = true
  `
  if (!members.length) {
    return NextResponse.json({ ok: true, verified: 0, byStatus: {} })
  }

  // Prior bounces from outreach_messages (any campaign, any time)
  const bouncedRows = await sql<any[]>`
    SELECT DISTINCT lower(trim(to_email)) AS email
    FROM outreach_messages
    WHERE user_id = ${user.id} AND bounced_at IS NOT NULL AND to_email IS NOT NULL
  `
  const bounced = new Set(bouncedRows.map((r) => r.email))

  const emails = members.map((m) => m.email as string | null)
  const results = await verifyEmails(emails, bounced, { concurrencyPerBatch: 20 })

  // Persist per-member
  const byStatus: Partial<Record<EmailStatus, number>> = {}
  for (let i = 0; i < members.length; i++) {
    const r = results[i]
    byStatus[r.status] = (byStatus[r.status] || 0) + 1
    await sql`
      UPDATE outreach_campaign_members
      SET email_status = ${r.status}, email_quality_reason = ${r.reason}
      WHERE id = ${members[i].id}
    `
  }

  return NextResponse.json({ ok: true, verified: members.length, byStatus })
}

/**
 * GET /api/cron/outreach-deliverability
 *
 * Hourly cron. System-wide (all users) Resend event sync: folds delivered /
 * opened / clicked / bounced / complained into outreach_messages and, on a hard
 * bounce or complaint, suppresses the address and stops that entry's sequence
 * (P1-7 of docs/founder-outreach-audit.md). Previously this only ran manually,
 * per-user, from the UI.
 *
 * Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { syncMessageEvent } from "@/lib/outreach/deliverability"

export const runtime = "nodejs"
export const maxDuration = 300

const BATCH = 200

function authorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: true, skipped: true, reason: "RESEND_API_KEY not configured" })
  }

  const rows = (await sql`
    SELECT id, resend_id, user_id, crm_entry_id, email_to
    FROM outreach_messages
    WHERE resend_id IS NOT NULL
      AND sent_at > now() - interval '30 days'
      AND (resend_last_event IS NULL OR resend_last_event NOT IN ('bounced','complained'))
    ORDER BY last_resend_sync_at ASC NULLS FIRST
    LIMIT ${BATCH}
  `) as Array<{ id: string; resend_id: string; user_id: string | null; crm_entry_id: string | null; email_to: string | null }>

  const tally: Record<string, number> = {}
  let checked = 0, failed = 0
  for (const m of rows) {
    try {
      const ev = await syncMessageEvent({
        id: m.id, resendId: m.resend_id, userId: m.user_id,
        crmEntryId: m.crm_entry_id, emailTo: m.email_to,
      })
      checked++
      if (ev) tally[ev] = (tally[ev] ?? 0) + 1
      await new Promise((r) => setTimeout(r, 80)) // ~10 rps ceiling
    } catch (e) {
      failed++
      console.error("[outreach-deliverability]", m.resend_id, (e as any)?.message)
    }
  }

  return NextResponse.json({ ok: true, checked, failed, remaining: rows.length === BATCH, events: tally })
}

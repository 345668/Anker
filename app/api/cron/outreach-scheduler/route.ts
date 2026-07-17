/**
 * GET /api/cron/outreach-scheduler
 *
 * Vercel cron endpoint. Runs every 10 min (vercel.json). For every
 * outreach_campaign_schedules row with status='pending' and
 * scheduled_at <= NOW(), executes the action and marks 'done' / 'failed'
 * with a result_summary.
 *
 * Actions:
 *   send_batch         — flip draft outreach_messages to status='queued'
 *                         with scheduled_for=NOW(). The existing send
 *                         worker picks up from queued.
 *   send_openers_nudge — for every message with last_opened_at set and
 *                         no reply (status != 'replied') and not bounced,
 *                         insert a NEW outreach_messages row with
 *                         kind='close_loop' as the nudge. Unique
 *                         (crm_entry_id, kind) enforces one nudge each.
 *   send_bounces_retry — placeholder for future.
 *
 * Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const maxDuration = 300

function authorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`
}

interface RunResult { scheduleId: string; action: string; ok: boolean; detail: any }

export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const due = await sql<any[]>`
    SELECT id, user_id, campaign_id, action_type, filter_config
    FROM outreach_campaign_schedules
    WHERE status = 'pending' AND scheduled_at <= NOW()
    ORDER BY scheduled_at
    LIMIT 100
  `

  const results: RunResult[] = []
  for (const s of due) {
    await sql`
      UPDATE outreach_campaign_schedules SET status = 'running', updated_at = NOW()
      WHERE id = ${s.id}
    `
    try {
      const r = await runAction(s)
      await sql`
        UPDATE outreach_campaign_schedules
        SET status = 'done', executed_at = NOW(), result_summary = ${JSON.stringify(r)}::jsonb,
            updated_at = NOW()
        WHERE id = ${s.id}
      `
      results.push({ scheduleId: s.id, action: s.action_type, ok: true, detail: r })
    } catch (e: any) {
      const errSummary = { error: e?.message || "Unknown error" }
      await sql`
        UPDATE outreach_campaign_schedules
        SET status = 'failed', executed_at = NOW(), result_summary = ${JSON.stringify(errSummary)}::jsonb,
            updated_at = NOW()
        WHERE id = ${s.id}
      `
      results.push({ scheduleId: s.id, action: s.action_type, ok: false, detail: errSummary })
    }
  }

  return NextResponse.json({ ok: true, ran: results.length, results })
}

async function runAction(s: any): Promise<any> {
  const { user_id, campaign_id, action_type } = s

  if (action_type === "send_batch") {
    const upd = await sql<any[]>`
      UPDATE outreach_messages
      SET status = 'queued', scheduled_for = COALESCE(scheduled_for, NOW()), updated_at = NOW()
      WHERE user_id = ${user_id}
        AND status = 'draft'
        AND crm_entry_id IN (
          SELECT crm_entry_id FROM outreach_campaign_members
          WHERE campaign_id = ${campaign_id} AND user_id = ${user_id} AND selected = true
        )
      RETURNING id
    `
    return { flaggedForSend: upd.length }
  }

  if (action_type === "send_openers_nudge") {
    const opened = await sql<any[]>`
      SELECT om.id AS orig_id, om.crm_entry_id, om.subject, om.email_to, om.email_from,
             c.display_name
      FROM outreach_messages om
      JOIN outreach_campaign_members m ON m.crm_entry_id = om.crm_entry_id
      JOIN crm_entries c ON c.id = om.crm_entry_id
      WHERE m.campaign_id = ${campaign_id} AND m.user_id = ${user_id}
        AND om.user_id = ${user_id}
        AND om.last_opened_at IS NOT NULL
        AND om.status NOT IN ('replied','failed','cancelled')
        AND om.bounced_at IS NULL
        AND om.kind = 'connection_request'   -- only nudge on the initial touch
    `
    let created = 0
    for (const o of opened) {
      const firstName = String(o.display_name || "").split(" ")[0] || "there"
      const nudgeBody = `Hi ${firstName},

Quick nudge in case my note last week got buried — session is Thursday and I wanted to make sure you had the RSVP link before we close the list.

Thursday July 16 · 19:30 CEST · Zoom
RSVP: https://luma.com/9swwcx6r?tk=VlEWAC

If it's not for you, no need to reply — I'll stop pinging.

Best,
Philippe`
      const ins = await sql<any[]>`
        INSERT INTO outreach_messages (
          user_id, crm_entry_id, kind, step_number, channel, body, status,
          subject, email_from, email_to, scheduled_for
        ) VALUES (
          ${user_id}, ${o.crm_entry_id}, 'close_loop', 3, 'email', ${nudgeBody}, 'queued',
          ${'Re: ' + (o.subject || 'Following up on Jul 16')},
          ${o.email_from || null}, ${o.email_to || null}, NOW()
        )
        ON CONFLICT (crm_entry_id, kind) DO NOTHING
        RETURNING id
      `
      if (ins.length) created++
    }
    return { nudgesCreated: created, sourceOpenersConsidered: opened.length }
  }

  if (action_type === "send_bounces_retry") {
    return { skipped: "send_bounces_retry not yet implemented" }
  }

  throw new Error(`Unknown action_type ${action_type}`)
}

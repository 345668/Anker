/**
 * GET /api/cron/outreach-reengage
 *
 * Daily cron. The reply classifier stamps a `reengage_on` date on
 * INTERESTED_LATER / WRONG_NOW replies ("ping me in Q3") — but nothing ever
 * re-opened them. This closes that gap (P1-5 of docs/founder-outreach-audit.md):
 * when the date comes due, draft an approval-gated re-engagement follow-up so it
 * surfaces in the founder's outbox, then clear the date so it fires once.
 *
 * Skips entries that have since progressed (meeting/passed/closed) and
 * suppressed recipients. Draft only — never auto-sends.
 *
 * Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { founderContextForUser } from "@/lib/outreach/reply-actions"
import { isEmailSuppressed } from "@/lib/outreach/deliverability"

export const runtime = "nodejs"
export const maxDuration = 120

function authorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const due = (await sql`
    SELECT r.id, r.user_id, r.crm_entry_id, e.display_name, e.display_email
    FROM outreach_replies r
    JOIN crm_entries e ON e.id = r.crm_entry_id
    WHERE r.reengage_on IS NOT NULL AND r.reengage_on <= CURRENT_DATE
      AND e.stage NOT IN ('meeting','passed','closed','won')
    ORDER BY r.reengage_on ASC
    LIMIT 100
  `) as any[]

  const founderCache = new Map<string, Awaited<ReturnType<typeof founderContextForUser>>>()
  let drafted = 0, skippedNoFounder = 0, skippedSuppressed = 0

  for (const r of due) {
    const userId = r.user_id as string | null
    const crmEntryId = r.crm_entry_id as string | null
    if (!userId || !crmEntryId) continue

    if (!founderCache.has(userId)) {
      founderCache.set(userId, await founderContextForUser(userId).catch(() => null))
    }
    const founder = founderCache.get(userId) ?? null
    if (!founder) { skippedNoFounder++; continue } // retry next run once a profile exists

    const toEmail = String(r.display_email ?? "").trim()
    if (toEmail && (await isEmailSuppressed(userId, toEmail))) {
      // suppressed — don't re-engage; clear the date so it stops recurring
      await sql`UPDATE outreach_replies SET reengage_on = NULL, updated_at = NOW() WHERE id = ${r.id}`
      skippedSuppressed++
      continue
    }

    const firstName = String(r.display_name || "").split(" ")[0] || "there"
    const cal = founder.calendarUrl || "[your calendar link]"
    const body = `Hi ${firstName},

Circling back at the timing you flagged. Quick reminder of what we are building: ${founder.oneLiner}.

If it is worth a short conversation now, here is my calendar: ${cal}

If the timing still is not right, tell me and I will check back later.

Best,
${founder.companyName}`

    // Draft (approval-gated). Distinct kind so it never collides with the
    // sequence's 'follow_up'. One re-engage draft per entry (unique index).
    const ins = (await sql`
      INSERT INTO outreach_messages (
        user_id, crm_entry_id, kind, step_number, channel, body, status,
        subject, email_to, created_at, updated_at
      ) VALUES (
        ${userId}, ${crmEntryId}, 'reengage', 5, 'email', ${body}, 'draft',
        ${`Re: ${founder.companyName}`}, ${toEmail || null}, NOW(), NOW()
      )
      ON CONFLICT (crm_entry_id, kind) DO NOTHING
      RETURNING id
    `) as any[]

    await sql`UPDATE outreach_replies SET reengage_on = NULL, updated_at = NOW() WHERE id = ${r.id}`
    if (ins.length) drafted++
  }

  return NextResponse.json({ ok: true, due: due.length, drafted, skippedNoFounder, skippedSuppressed })
}

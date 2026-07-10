/**
 * GET /api/outreach/stats — the outreach engine's headline numbers.
 *
 *   sent          messages with sent_at (all time / last 30d)
 *   openRate      share of sent (30d) with opens > 0
 *   clickRate     share of sent (30d) with clicks > 0
 *   replies       outreach_replies received (30d) + awaiting response (no
 *                 approved outbound yet)
 *   scheduled     messages queued with scheduled_for in the future
 *   followupsDue  needs_followup or followup_due_at <= now
 *
 * User-scoped, read-only.
 */
import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const [msg, replies] = await Promise.all([
    sql`
      select
        count(*) filter (where sent_at is not null)::int                                   as sent_all,
        count(*) filter (where sent_at > now() - interval '30 days')::int                  as sent_30d,
        count(*) filter (where sent_at > now() - interval '30 days' and opens > 0)::int    as opened_30d,
        count(*) filter (where sent_at > now() - interval '30 days' and clicks > 0)::int   as clicked_30d,
        count(*) filter (where sent_at is null and scheduled_for > now())::int             as scheduled,
        count(*) filter (where needs_followup = true
                          or (followup_due_at is not null and followup_due_at <= now()))::int as followups_due
      from outreach_messages
      where user_id = ${user.id}
    ` as Promise<Array<Record<string, number>>>,
    sql`
      select
        count(*) filter (where received_at > now() - interval '30 days')::int as replies_30d,
        count(*) filter (where approved is not true and sent_at is null)::int as awaiting
      from outreach_replies
      where user_id = ${user.id}
    ` as Promise<Array<Record<string, number>>>,
  ])

  const m = msg[0] ?? {}
  const r = replies[0] ?? {}
  const sent30 = m.sent_30d ?? 0

  return NextResponse.json({
    sentAll: m.sent_all ?? 0,
    sent30d: sent30,
    openRate: sent30 ? Math.round(((m.opened_30d ?? 0) / sent30) * 100) : null,
    clickRate: sent30 ? Math.round(((m.clicked_30d ?? 0) / sent30) * 100) : null,
    scheduled: m.scheduled ?? 0,
    followupsDue: m.followups_due ?? 0,
    replies30d: r.replies_30d ?? 0,
    repliesAwaiting: r.awaiting ?? 0,
  })
}

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
 *   callConv      share of investors sent a scheduling email (kind='schedule')
 *                 who now have a logged call (investor_calls) — the
 *                 interested->call conversion
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
                          or (followup_due_at is not null and followup_due_at <= now()))::int as followups_due,
        count(*) filter (where sent_at > now() - interval '30 days' and delivered_at is not null)::int as delivered_30d,
        count(*) filter (where sent_at > now() - interval '30 days' and bounced_at is not null)::int   as bounced_30d
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

  // Scheduling-email → logged-call conversion. investor_calls ships in a
  // separate migration, so guard the whole thing and degrade to nulls.
  let scheduleSent = 0
  let callsBooked = 0
  try {
    const conv = (await sql`
      select
        count(distinct m.crm_entry_id)::int as schedule_sent,
        count(distinct m.crm_entry_id) filter (where c.crm_entry_id is not null)::int as calls_booked
      from outreach_messages m
      left join (
        select distinct crm_entry_id::text as crm_entry_id
        from investor_calls
        where user_id = ${user.id} and crm_entry_id is not null
      ) c on c.crm_entry_id = m.crm_entry_id::text
      where m.user_id = ${user.id} and m.kind = 'schedule' and m.sent_at is not null
    `) as Array<Record<string, number>>
    scheduleSent = conv[0]?.schedule_sent ?? 0
    callsBooked = conv[0]?.calls_booked ?? 0
  } catch {/* investor_calls migration may not have run */}

  const m = msg[0] ?? {}
  const r = replies[0] ?? {}
  const sent30 = m.sent_30d ?? 0

  return NextResponse.json({
    scheduleSent,
    callsBooked,
    callConversion: scheduleSent ? Math.round((callsBooked / scheduleSent) * 100) : null,
    sentAll: m.sent_all ?? 0,
    sent30d: sent30,
    openRate: sent30 ? Math.round(((m.opened_30d ?? 0) / sent30) * 100) : null,
    clickRate: sent30 ? Math.round(((m.clicked_30d ?? 0) / sent30) * 100) : null,
    scheduled: m.scheduled ?? 0,
    followupsDue: m.followups_due ?? 0,
    replies30d: r.replies_30d ?? 0,
    repliesAwaiting: r.awaiting ?? 0,
    deliveredRate: sent30 ? Math.round(((m.delivered_30d ?? 0) / sent30) * 100) : null,
    bounced30d: m.bounced_30d ?? 0,
  })
}

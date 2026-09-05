/**
 * GET /api/outreach/analytics — per-campaign funnel.
 *
 * For each non-archived campaign: members → drafted → sent (member status),
 * plus engagement joined via the members' crm entries: opened / clicked
 * message counts and replies. Approximation note: messages aren't
 * campaign-stamped, so engagement is attributed through campaign membership
 * — a contact in two campaigns counts in both.
 */
import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const rows = await sql`
    with member_stats as (
      select m.campaign_id,
             count(*)::int                                        as members,
             count(*) filter (where m.status = 'drafted')::int    as drafted,
             count(*) filter (where m.status = 'sent')::int       as sent,
             max(m.sent_at)                                       as last_sent_at
      from outreach_campaign_members m
      where m.user_id = ${user.id}
      group by m.campaign_id
    ),
    engagement as (
      select m.campaign_id,
             count(distinct om.crm_entry_id) filter (where om.opens > 0)::int  as opened_contacts,
             count(distinct om.crm_entry_id) filter (where om.clicks > 0)::int as clicked_contacts,
             count(distinct r.crm_entry_id)::int                               as replied_contacts
      from outreach_campaign_members m
      left join outreach_messages om
        on om.user_id = m.user_id and om.crm_entry_id = m.crm_entry_id and om.sent_at is not null
      left join outreach_replies r
        on r.user_id = m.user_id and r.crm_entry_id = m.crm_entry_id
      where m.user_id = ${user.id}
      group by m.campaign_id
    )
    select c.id, c.name, c.status,
           coalesce(ms.members, 0)          as members,
           coalesce(ms.drafted, 0)          as drafted,
           coalesce(ms.sent, 0)             as sent,
           ms.last_sent_at,
           coalesce(en.opened_contacts, 0)  as opened,
           coalesce(en.clicked_contacts, 0) as clicked,
           coalesce(en.replied_contacts, 0) as replied
    from outreach_campaigns c
    left join member_stats ms on ms.campaign_id = c.id
    left join engagement  en on en.campaign_id = c.id
    where c.user_id = ${user.id} and c.archived = false
    order by c.updated_at desc
    limit 100
  `

  // Reply funnel — the loop-closing metrics (P2-12 of the outreach audit).
  const [funnelRow] = (await sql`
    with sent as (
      select count(distinct crm_entry_id)::int n
      from outreach_messages
      where user_id = ${user.id} and sent_at is not null
    ),
    replies as (
      select
        count(distinct crm_entry_id)::int as replied_contacts,
        count(*) filter (where classification in ('INTERESTED','INTERESTED_LATER'))::int as positive,
        count(*) filter (where classification = 'INTERESTED')::int as meetings,
        count(*)::int as total_replies
      from outreach_replies
      where user_id = ${user.id}
    ),
    ttfr as (
      select avg(extract(epoch from (r.received_at - m.sent_at)))::float as avg_seconds
      from outreach_replies r
      join outreach_messages m on m.id = r.in_reply_to_message_id
      where r.user_id = ${user.id} and m.sent_at is not null and r.received_at >= m.sent_at
    ),
    stopped as (
      select count(*)::int n
      from outreach_messages
      where user_id = ${user.id} and status = 'cancelled'
    ),
    suppressed as (
      select count(*)::int n from email_suppressions where user_id = ${user.id}
    )
    select sent.n as sent_contacts, replies.replied_contacts, replies.positive,
           replies.meetings, replies.total_replies, ttfr.avg_seconds,
           stopped.n as sequence_steps_stopped, suppressed.n as suppressed_addresses
    from sent, replies, ttfr, stopped, suppressed
  `) as any[]

  const sent = Number(funnelRow?.sent_contacts ?? 0)
  const replied = Number(funnelRow?.replied_contacts ?? 0)
  const positive = Number(funnelRow?.positive ?? 0)
  const totalReplies = Number(funnelRow?.total_replies ?? 0)
  const rate = (num: number, den: number) => (den > 0 ? num / den : null)

  const funnel = {
    sentContacts: sent,
    repliedContacts: replied,
    replyRate: rate(replied, sent),
    positiveReplies: positive,
    positiveRate: rate(positive, totalReplies),
    meetings: Number(funnelRow?.meetings ?? 0),
    totalReplies,
    avgTimeToFirstReplyHours:
      funnelRow?.avg_seconds != null ? Math.round((Number(funnelRow.avg_seconds) / 3600) * 10) / 10 : null,
    sequenceStepsStopped: Number(funnelRow?.sequence_steps_stopped ?? 0),
    suppressedAddresses: Number(funnelRow?.suppressed_addresses ?? 0),
  }

  return NextResponse.json({ campaigns: rows, funnel })
}

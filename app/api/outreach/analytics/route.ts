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
  return NextResponse.json({ campaigns: rows })
}

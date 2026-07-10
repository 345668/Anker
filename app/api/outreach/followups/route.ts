/**
 * /api/outreach/followups — the actionable inbox behind the Outreach engine.
 *
 *   GET   two queues, newest-first:
 *           followups : sent messages flagged needs_followup or with
 *                       followup_due_at due — "no answer yet, nudge them"
 *           replies   : inbound replies (30d) with classification + the AI
 *                       draft response when one exists
 *   POST  { messageId, done: true }   clear a follow-up flag
 *         { replyId, approved: true } mark a reply as handled
 *
 * User-scoped. Joined to crm_entries for names so the UI can deep-link
 * into the CRM detail pane and the studio.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const [followups, replies] = await Promise.all([
    sql`
      select m.id, m.crm_entry_id, m.kind, m.subject, m.sent_at, m.opens, m.clicks,
             m.followup_due_at, e.display_name, e.stage
      from outreach_messages m
      left join crm_entries e on e.id = m.crm_entry_id
      where m.user_id = ${user.id}
        and (m.needs_followup = true
             or (m.followup_due_at is not null and m.followup_due_at <= now() + interval '1 day'))
        and m.sent_at is not null
      order by m.followup_due_at asc nulls last, m.sent_at asc
      limit 100
    `,
    sql`
      select r.id, r.crm_entry_id, r.inbound_text, r.classification, r.draft_response,
             r.recommended_stage, r.approved, r.received_at, e.display_name, e.stage
      from outreach_replies r
      left join crm_entries e on e.id = r.crm_entry_id
      where r.user_id = ${user.id}
        and r.received_at > now() - interval '30 days'
      order by (r.approved is not true) desc, r.received_at desc
      limit 100
    `,
  ])

  return NextResponse.json({ followups, replies })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof body.messageId === "string" && body.done === true) {
    const rows = await sql`
      update outreach_messages
      set needs_followup = false, followup_due_at = null, updated_at = now()
      where id = ${body.messageId}::uuid and user_id = ${user.id}
      returning id
    ` as Array<{ id: string }>
    if (!rows.length) return NextResponse.json({ error: "Message not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  if (typeof body.replyId === "string" && body.approved === true) {
    const rows = await sql`
      update outreach_replies
      set approved = true, updated_at = now()
      where id = ${body.replyId}::uuid and user_id = ${user.id}
      returning id
    ` as Array<{ id: string }>
    if (!rows.length) return NextResponse.json({ error: "Reply not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Provide { messageId, done } or { replyId, approved }" }, { status: 400 })
}

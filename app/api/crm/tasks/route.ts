/**
 * /api/crm/tasks — follow-ups & reminders on CRM contacts.
 *
 *   GET  ?entryId=&open=1        list tasks (optionally per contact / open only)
 *   POST { entryId?, title, dueAt?, notes? }   create
 *
 * User-scoped (Supabase session). crm_entries.id is TEXT — no ::uuid.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const entryId = sp.get("entryId")
  const openOnly = sp.get("open") === "1"

  const rows = await sql`
    select t.id, t.crm_entry_id, t.title, t.due_at, t.done_at, t.notes, t.created_at,
           e.display_name as entry_name
    from crm_tasks t
    left join crm_entries e on e.id = t.crm_entry_id
    where t.user_id = ${user.id}
      and (${entryId}::text is null or t.crm_entry_id = ${entryId})
      and (${openOnly} = false or t.done_at is null)
    order by t.done_at nulls first, t.due_at asc nulls last, t.created_at desc
    limit 500
  `
  return NextResponse.json({ tasks: rows })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 300) : ""
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 })

  const entryId = typeof body.entryId === "string" && body.entryId ? body.entryId : null
  const dueAt = body.dueAt ? new Date(body.dueAt) : null
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: "Invalid dueAt" }, { status: 400 })
  }
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) || null : null

  const rows = await sql`
    insert into crm_tasks (user_id, crm_entry_id, title, due_at, notes)
    values (${user.id}, ${entryId}, ${title}, ${dueAt ? dueAt.toISOString() : null}, ${notes})
    returning id, crm_entry_id, title, due_at, done_at, notes, created_at
  ` as Array<Record<string, unknown>>
  return NextResponse.json({ ok: true, task: rows[0] }, { status: 201 })
}

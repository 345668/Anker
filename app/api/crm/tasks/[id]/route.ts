/**
 * PATCH  /api/crm/tasks/[id] — edit / complete / reopen a task
 *          { title?, dueAt?, notes?, done? }  (done: true|false toggles done_at)
 * DELETE /api/crm/tasks/[id]
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const { id } = await ctx.params

  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 300) : null
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null
  const hasDue = "dueAt" in body
  const dueAt = hasDue && body.dueAt ? new Date(body.dueAt) : null
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: "Invalid dueAt" }, { status: 400 })
  }
  const hasDone = typeof body.done === "boolean"

  const rows = await sql`
    update crm_tasks set
      title   = coalesce(${title}, title),
      notes   = coalesce(${notes}, notes),
      due_at  = case when ${hasDue} then ${dueAt ? dueAt.toISOString() : null} else due_at end,
      done_at = case when ${hasDone} then (case when ${hasDone && body.done === true} then now() else null end) else done_at end,
      updated_at = now()
    where id = ${id}::uuid and user_id = ${user.id}
    returning id, crm_entry_id, title, due_at, done_at, notes, created_at
  ` as Array<Record<string, unknown>>
  if (!rows.length) return NextResponse.json({ error: "Task not found" }, { status: 404 })
  return NextResponse.json({ ok: true, task: rows[0] })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const { id } = await ctx.params
  const rows = await sql`
    delete from crm_tasks where id = ${id}::uuid and user_id = ${user.id} returning id
  ` as Array<{ id: string }>
  if (!rows.length) return NextResponse.json({ error: "Task not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

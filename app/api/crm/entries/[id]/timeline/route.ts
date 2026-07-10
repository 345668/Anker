/**
 * GET /api/crm/entries/[id]/timeline — the contact's activity feed.
 *
 * Merges outreach messages (drafts, sends, opens) and tasks into one
 * chronological stream for the detail pane. Read-only.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export interface TimelineItem {
  kind: "outreach" | "task"
  at: string
  title: string
  detail: string | null
  meta: Record<string, unknown>
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const { id } = await ctx.params

  const [messages, tasks] = await Promise.all([
    sql`
      select id, kind, channel, status, subject, sent_at, created_at, opens, clicks, char_count
      from outreach_messages
      where user_id = ${user.id} and crm_entry_id = ${id}
      order by created_at desc
      limit 100
    ` as Promise<Array<{
      id: string; kind: string | null; channel: string | null; status: string | null
      subject: string | null; sent_at: string | null; created_at: string
      opens: number | null; clicks: number | null; char_count: number | null
    }>>,
    sql`
      select id, title, due_at, done_at, notes, created_at
      from crm_tasks
      where user_id = ${user.id} and crm_entry_id = ${id}
      order by created_at desc
      limit 100
    ` as Promise<Array<{
      id: string; title: string; due_at: string | null; done_at: string | null
      notes: string | null; created_at: string
    }>>,
  ])

  const items: TimelineItem[] = []
  for (const m of messages) {
    const label = m.kind === "dm_intro" ? "LinkedIn DM" : m.kind === "email_intro" ? "Email" : (m.kind || m.channel || "Message")
    items.push({
      kind: "outreach",
      at: m.sent_at || m.created_at,
      title: `${label} ${m.sent_at ? "sent" : `(${m.status || "draft"})`}`,
      detail: m.subject,
      meta: { id: m.id, status: m.status, opens: m.opens, clicks: m.clicks, sentAt: m.sent_at },
    })
  }
  for (const t of tasks) {
    items.push({
      kind: "task",
      at: t.done_at || t.created_at,
      title: t.done_at ? `Task done — ${t.title}` : `Task — ${t.title}`,
      detail: t.notes,
      meta: { id: t.id, dueAt: t.due_at, doneAt: t.done_at },
    })
  }
  items.sort((a, b) => (a.at < b.at ? 1 : -1))

  return NextResponse.json({ items: items.slice(0, 150) })
}

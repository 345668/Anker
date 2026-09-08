/**
 * GET /api/outreach/ready-for-call — the founder's "take the call" queue.
 *
 * The signal that an investor is ready for a call lives in two places, both
 * surfaced here as one list, newest signal first:
 *
 *   awaiting_approval   — an inbound reply classified INTERESTED that the
 *                         founder hasn't approved/sent yet. THE action: review
 *                         and send the scheduling email (with the calendar link).
 *   sent_awaiting_reply — a scheduling email (kind='schedule') already sent;
 *                         we're waiting on the investor to pick a time.
 *
 * Pure read over existing state — no writes, no new table. User-scoped.
 */
import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ReadyItem {
  crmEntryId: string
  name: string
  firm: string | null
  title: string | null
  stage: string | null
  state: "awaiting_approval" | "sent_awaiting_reply"
  replyId?: string
  draftId?: string
  preview: string | null
  signalAt: string | null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const [awaiting, sent] = await Promise.all([
    sql`
      SELECT c.id AS crm_entry_id, c.display_name, c.display_type, c.display_title,
             c.stage, r.id AS reply_id, r.draft_response, r.received_at
      FROM outreach_replies r
      JOIN crm_entries c ON c.id = r.crm_entry_id AND c.user_id = r.user_id
      WHERE r.user_id = ${user.id}
        AND r.classification = 'INTERESTED'
        AND r.approved IS NOT TRUE
      ORDER BY r.received_at DESC NULLS LAST
      LIMIT 100
    ` as Promise<any[]>,
    sql`
      SELECT c.id AS crm_entry_id, c.display_name, c.display_type, c.display_title,
             c.stage, m.id AS draft_id, m.body, m.sent_at
      FROM outreach_messages m
      JOIN crm_entries c ON c.id = m.crm_entry_id AND c.user_id = m.user_id
      WHERE m.user_id = ${user.id}
        AND m.kind = 'schedule'
        AND m.status IN ('sent','delivered')
      ORDER BY m.sent_at DESC NULLS LAST
      LIMIT 100
    ` as Promise<any[]>,
  ])

  // Merge, keyed by CRM entry. A fresh unapproved INTERESTED reply outranks an
  // already-sent scheduling email (they replied again → founder must act).
  const byEntry = new Map<string, ReadyItem>()

  for (const s of sent) {
    byEntry.set(String(s.crm_entry_id), {
      crmEntryId: String(s.crm_entry_id),
      name: s.display_name ?? "Unknown",
      firm: s.display_type ?? null,
      title: s.display_title ?? null,
      stage: s.stage ?? null,
      state: "sent_awaiting_reply",
      draftId: s.draft_id ?? undefined,
      preview: s.body ?? null,
      signalAt: s.sent_at ? new Date(s.sent_at).toISOString() : null,
    })
  }
  for (const a of awaiting) {
    byEntry.set(String(a.crm_entry_id), {
      crmEntryId: String(a.crm_entry_id),
      name: a.display_name ?? "Unknown",
      firm: a.display_type ?? null,
      title: a.display_title ?? null,
      stage: a.stage ?? null,
      state: "awaiting_approval",
      replyId: a.reply_id ?? undefined,
      preview: a.draft_response ?? null,
      signalAt: a.received_at ? new Date(a.received_at).toISOString() : null,
    })
  }

  const items = Array.from(byEntry.values()).sort(
    (x, y) => (y.signalAt ?? "").localeCompare(x.signalAt ?? ""),
  )
  const counts = {
    awaiting_approval: items.filter((i) => i.state === "awaiting_approval").length,
    sent_awaiting_reply: items.filter((i) => i.state === "sent_awaiting_reply").length,
  }

  return NextResponse.json({ items, counts })
}

/**
 * POST /api/updates/[id]/sync — pull Resend open/click events for an update's
 * recipients and fold them into engagement (opened_at / open_count / last_event).
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { getResendEmail } from "@/lib/email/resend"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ ok: true, skipped: true, reason: "RESEND_API_KEY not configured" })

  const rows = (await sql`
    SELECT id, resend_id FROM investor_update_recipients
    WHERE update_id = ${id} AND user_id = ${user.id} AND resend_id IS NOT NULL
    LIMIT 200
  `) as any[]

  let opened = 0
  for (const r of rows) {
    try {
      const status = await getResendEmail(r.resend_id)
      const ev = status?.lastEvent ?? null
      const isOpen = ev === "opened" || ev === "clicked"
      await sql`
        UPDATE investor_update_recipients SET
          last_event = COALESCE(${ev}, last_event),
          opened_at = CASE WHEN ${isOpen} AND opened_at IS NULL THEN NOW() ELSE opened_at END,
          open_count = CASE WHEN ${isOpen} THEN GREATEST(open_count, 1) ELSE open_count END
        WHERE id = ${r.id}
      `
      if (isOpen) opened++
      await new Promise((res) => setTimeout(res, 100))
    } catch { /* skip */ }
  }
  return NextResponse.json({ ok: true, checked: rows.length, opened })
}

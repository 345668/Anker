/**
 * POST /api/outreach/sync-resend — pull delivery telemetry from Resend.
 *
 * For the user's sent messages that have a resend_id (last 60 days,
 * least-recently-synced first, max 60 per call), fetch Resend's per-email
 * status and fold `last_event` into outreach_messages:
 *
 *   delivered / delivery_delayed → delivered_at (once)
 *   opened                       → opens = max(opens, 1) + delivered_at
 *   clicked                      → clicks = max(clicks, 1) + opens floor
 *   bounced                      → bounced_at + failed_reason
 *   complained                   → complained_at (suppress future sends!)
 *
 * Idempotent — timestamps only ever fill forward, counters only rise.
 * Returns per-event tallies so the UI can toast the outcome. Rate-kind:
 * sequential with a small delay (Resend allows ~10 rps).
 */
import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { syncMessageEvent } from "@/lib/outreach/deliverability"

export const runtime = "nodejs"
export const maxDuration = 120

const BATCH = 60

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured on this deployment." }, { status: 503 })
  }

  const rows = await sql`
    select id, resend_id, crm_entry_id, email_to
    from outreach_messages
    where user_id = ${user.id}
      and resend_id is not null
      and sent_at > now() - interval '60 days'
    order by last_resend_sync_at asc nulls first
    limit ${BATCH}
  ` as Array<{ id: string; resend_id: string; crm_entry_id: string | null; email_to: string | null }>

  const tally: Record<string, number> = {}
  let checked = 0
  let failed = 0

  for (const m of rows) {
    try {
      // syncMessageEvent folds in the Resend status AND applies bounce/complaint
      // actions (suppress the address + stop the sequence).
      const ev = await syncMessageEvent({
        id: m.id, resendId: m.resend_id, userId: user.id,
        crmEntryId: m.crm_entry_id, emailTo: m.email_to,
      })
      checked++
      if (ev) tally[ev] = (tally[ev] ?? 0) + 1
      // Gentle pacing — Resend rate limits around 10 rps.
      await new Promise((r) => setTimeout(r, 120))
    } catch (e) {
      failed++
      console.error("[sync-resend]", m.resend_id, (e as any)?.message)
    }
  }

  return NextResponse.json({ ok: true, checked, failed, remaining: rows.length === BATCH, events: tally })
}

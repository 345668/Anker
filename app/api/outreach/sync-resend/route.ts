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
import { getResendEmail } from "@/lib/email/resend"

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
    select id, resend_id
    from outreach_messages
    where user_id = ${user.id}
      and resend_id is not null
      and sent_at > now() - interval '60 days'
    order by last_resend_sync_at asc nulls first
    limit ${BATCH}
  ` as Array<{ id: string; resend_id: string }>

  const tally: Record<string, number> = {}
  let checked = 0
  let failed = 0

  for (const m of rows) {
    try {
      const status = await getResendEmail(m.resend_id)
      checked++
      const ev = status?.lastEvent ?? null
      if (ev) tally[ev] = (tally[ev] ?? 0) + 1

      await sql`
        update outreach_messages set
          resend_last_event = coalesce(${ev}, resend_last_event),
          delivered_at = case
            when ${ev === "delivered" || ev === "opened" || ev === "clicked"} and delivered_at is null
            then now() else delivered_at end,
          opens = case
            when ${ev === "opened" || ev === "clicked"} then greatest(coalesce(opens, 0), 1)
            else opens end,
          clicks = case
            when ${ev === "clicked"} then greatest(coalesce(clicks, 0), 1)
            else clicks end,
          bounced_at = case
            when ${ev === "bounced"} and bounced_at is null then now() else bounced_at end,
          failed_reason = case
            when ${ev === "bounced"} and failed_reason is null then 'bounced (resend)'
            else failed_reason end,
          complained_at = case
            when ${ev === "complained"} and complained_at is null then now() else complained_at end,
          last_resend_sync_at = now(),
          updated_at = now()
        where id = ${m.id} and user_id = ${user.id}
      `
      // Gentle pacing — Resend rate limits around 10 rps.
      await new Promise((r) => setTimeout(r, 120))
    } catch (e) {
      failed++
      console.error("[sync-resend]", m.resend_id, (e as any)?.message)
    }
  }

  return NextResponse.json({ ok: true, checked, failed, remaining: rows.length === BATCH, events: tally })
}

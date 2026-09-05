/**
 * POST /api/updates/[id]/send — send an update to recipients via Resend and
 * record them for engagement tracking. body: { recipients?: [{crmEntryId?, email, name}] }
 * If recipients omitted, uses the recommended CRM list. Suppression-aware.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { sendEmail, isResendConfigured } from "@/lib/email/resend"
import { isEmailSuppressed } from "@/lib/outreach/deliverability"
import { recommendRecipients } from "@/lib/updates/builder"
import { randomUUID } from "node:crypto"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const [update] = (await sql`SELECT * FROM investor_updates WHERE id = ${id} AND user_id = ${user.id} LIMIT 1`) as any[]
  if (!update) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (update.status === "sent") return NextResponse.json({ error: "Already sent" }, { status: 409 })

  const b = await req.json().catch(() => ({}))
  let recips: { crmEntryId?: string; email?: string; name?: string }[] =
    Array.isArray(b?.recipients) && b.recipients.length ? b.recipients : (await recommendRecipients(user.id))
  recips = recips.filter((r) => (r.email || "").includes("@"))
  if (!recips.length) return NextResponse.json({ error: "No recipients with an email address" }, { status: 400 })

  const subject = update.title || `${update.period ?? ""} investor update`
  const text = [update.body, update.asks ? `\nAsks:\n${update.asks}` : ""].filter(Boolean).join("\n")

  let sent = 0, skipped = 0
  for (const r of recips) {
    const email = String(r.email).trim()
    if (await isEmailSuppressed(user.id, email)) { skipped++; continue }
    const trackingId = randomUUID()
    let resendId: string | null = null
    if (isResendConfigured()) {
      try { const res = await sendEmail({ to: email, subject, text, trackingId }); resendId = res.resendId; sent++ }
      catch { skipped++; continue }
    }
    await sql`
      INSERT INTO investor_update_recipients (update_id, user_id, crm_entry_id, email, name, resend_id, tracking_id, sent_at, created_at)
      VALUES (${id}, ${user.id}, ${r.crmEntryId ?? null}, ${email}, ${r.name ?? null}, ${resendId}, ${trackingId}, NOW(), NOW())
    `
    if (isResendConfigured()) await new Promise((res) => setTimeout(res, 120)); // gentle pacing
  }

  await sql`UPDATE investor_updates SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = ${id} AND user_id = ${user.id}`
  return NextResponse.json({ ok: true, sent, skipped, recorded: recips.length - skipped, resendConfigured: isResendConfigured() })
}

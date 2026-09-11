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

  const [update] = (await sql`UPDATE investor_updates
    SET status = 'sending', updated_at = NOW()
    WHERE id = ${id} AND user_id = ${user.id} AND status IN ('draft', 'partial')
    RETURNING *`) as any[]
  if (!update) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const b = await req.json().catch(() => ({}))
  let recips: { crmEntryId?: string; email?: string; name?: string }[] =
    Array.isArray(b?.recipients) && b.recipients.length ? b.recipients : (await recommendRecipients(user.id))
  recips = recips.filter((r) => (r.email || "").includes("@"))
  if (!recips.length) {
    await sql`UPDATE investor_updates SET status = 'draft', updated_at = NOW() WHERE id = ${id} AND user_id = ${user.id}`
    return NextResponse.json({ error: "No recipients with an email address" }, { status: 400 })
  }

  const previouslySent = await sql`SELECT lower(email) AS email
    FROM investor_update_recipients
    WHERE update_id = ${id} AND delivery_status = 'sent'`
  const sentEmails = new Set(previouslySent.map((r: any) => String(r.email).toLowerCase()))
  recips = recips.filter((r) => !sentEmails.has(String(r.email).trim().toLowerCase()))
  if (!recips.length) {
    await sql`UPDATE investor_updates SET status = 'sent', sent_at = COALESCE(sent_at, NOW()), updated_at = NOW() WHERE id = ${id} AND user_id = ${user.id}`
    return NextResponse.json({ ok: true, sent: 0, skipped: 0, recorded: 0, resendConfigured: isResendConfigured() })
  }

  const subject = update.title || `${update.period ?? ""} investor update`
  const text = [update.body, update.asks ? `\nAsks:\n${update.asks}` : ""].filter(Boolean).join("\n")

  let sent = 0, skipped = 0, failed = 0
  for (const r of recips) {
    const email = String(r.email).trim()
    if (await isEmailSuppressed(user.id, email)) {
      skipped++
      await sql`INSERT INTO investor_update_recipients
        (update_id, user_id, crm_entry_id, email, name, delivery_status, last_error, created_at)
        VALUES (${id}, ${user.id}, ${r.crmEntryId ?? null}, ${email}, ${r.name ?? null}, 'skipped', 'Suppressed address', NOW())
        ON CONFLICT (update_id, lower(email)) DO UPDATE SET delivery_status = 'skipped', last_error = 'Suppressed address'`
      continue
    }
    const trackingId = randomUUID()
    let resendId: string | null = null
    if (isResendConfigured()) {
      try {
        const res = await sendEmail({ to: email, subject, text, trackingId, idempotencyKey: `investor-update:${id}:${email.toLowerCase()}` })
        resendId = res.resendId; sent++
      } catch (error) {
        failed++
        const message = error instanceof Error ? error.message.slice(0, 400) : "Delivery failed"
        await sql`INSERT INTO investor_update_recipients
          (update_id, user_id, crm_entry_id, email, name, tracking_id, delivery_status, last_error, created_at)
          VALUES (${id}, ${user.id}, ${r.crmEntryId ?? null}, ${email}, ${r.name ?? null}, ${trackingId}, 'failed', ${message}, NOW())
          ON CONFLICT (update_id, lower(email)) DO UPDATE SET delivery_status = 'failed', last_error = ${message}, tracking_id = ${trackingId}`
        continue
      }
    }
    await sql`
      INSERT INTO investor_update_recipients (update_id, user_id, crm_entry_id, email, name, resend_id, tracking_id, sent_at, created_at)
      VALUES (${id}, ${user.id}, ${r.crmEntryId ?? null}, ${email}, ${r.name ?? null}, ${resendId}, ${trackingId}, NOW(), NOW())
      ON CONFLICT (update_id, lower(email)) DO UPDATE SET resend_id = EXCLUDED.resend_id, tracking_id = EXCLUDED.tracking_id, sent_at = NOW(), delivery_status = 'sent', last_error = NULL
    `
    if (isResendConfigured()) await new Promise((res) => setTimeout(res, 120)); // gentle pacing
  }

  if (failed > 0) {
    await sql`UPDATE investor_updates SET status = ${sent > 0 ? "partial" : "draft"}, updated_at = NOW() WHERE id = ${id} AND user_id = ${user.id}`
    return NextResponse.json({ ok: false, error: `${failed} delivery${failed === 1 ? "" : "ies"} failed. Retry to send them again.`, sent, skipped, failed, recorded: sent, resendConfigured: isResendConfigured() }, { status: 502 })
  }
  await sql`UPDATE investor_updates SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = ${id} AND user_id = ${user.id}`
  return NextResponse.json({ ok: true, sent, skipped, failed: 0, recorded: sent, resendConfigured: isResendConfigured() })
}

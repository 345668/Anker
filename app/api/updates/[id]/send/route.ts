import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { sendEmail, isResendConfigured } from "@/lib/email/resend"
import { isEmailSuppressed } from "@/lib/outreach/deliverability"
import { sendRequest, type SendSnapshot } from "@/lib/updates/send-contract"
import { randomUUID } from "node:crypto"

export const runtime = "nodejs"
export const maxDuration = 300
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  // Check before claiming or writing ANY sent state.
  if (!isResendConfigured()) return NextResponse.json({ error: "Email delivery is unavailable. Your update has not been sent." }, { status: 503 })
  const parsed = sendRequest.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Review the content, recipients and saved revision before sending." }, { status: 400 })
  const input = parsed.data, token = randomUUID()
  let claimed = false
  try {
    const [current] = await sql`SELECT * FROM investor_updates WHERE id = ${id} AND user_id = ${user.id}`
    if (!current) return NextResponse.json({ error: "Update not found." }, { status: 404 })
    let snapshot = current.delivery_snapshot as SendSnapshot | null
    if (!snapshot) {
      if (!input.content || !input.recipients?.length) return NextResponse.json({ error: "Review and select at least one recipient." }, { status: 400 })
      const unique = new Map(input.recipients.map(r => [r.email.toLowerCase(), { ...r, email: r.email.toLowerCase(), trackingId: randomUUID() }]))
      snapshot = { ...input.content, startedAt: new Date().toISOString(), recipients: [...unique.values()] }
    } else if (Date.now() - new Date(snapshot.startedAt).getTime() > 20 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "This delivery needs reconciliation before another retry. Check provider delivery records to avoid duplicate messages." }, { status: 409 })
    }
    const [update] = await sql`UPDATE investor_updates SET status = 'sending', send_token = ${token},
      send_lease_until = now() + interval '2 minutes', delivery_snapshot = coalesce(delivery_snapshot, ${JSON.stringify(snapshot)}::jsonb),
      title = ${snapshot.title}, body = ${snapshot.body}, asks = ${snapshot.asks}, revision = revision + 1, last_error = NULL, updated_at = now()
      WHERE id = ${id} AND user_id = ${user.id} AND revision = ${input.revision}
        AND (status IN ('draft', 'partial') OR (status = 'sending' AND send_lease_until < now())) RETURNING *`
    if (!update) return NextResponse.json({ error: "Another request changed or is sending this update. Reload its delivery status." }, { status: 409 })
    claimed = true
    snapshot = update.delivery_snapshot as SendSnapshot
    const started = Date.now()
    for (const r of snapshot.recipients) {
      if (Date.now() - started > 230000) break
      const [lease] = await sql`UPDATE investor_updates SET send_lease_until = now() + interval '2 minutes'
        WHERE id = ${id} AND user_id = ${user.id} AND send_token = ${token} RETURNING id`
      if (!lease) throw new Error("Delivery ownership changed. Reload before retrying.")
      const [existing] = await sql`SELECT delivery_status FROM investor_update_recipients WHERE update_id = ${id} AND lower(email) = ${r.email}`
      if (["sent", "skipped"].includes(existing?.delivery_status)) continue
      await sql`INSERT INTO investor_update_recipients(update_id, user_id, crm_entry_id, email, name, tracking_id, delivery_status, sent_at)
        VALUES (${id}, ${user.id}, ${r.crmEntryId ?? null}, ${r.email}, ${r.name ?? null}, ${r.trackingId}, 'pending', NULL)
        ON CONFLICT (update_id, lower(email)) WHERE email IS NOT NULL DO NOTHING`
      if (await isEmailSuppressed(user.id, r.email)) {
        await sql`UPDATE investor_update_recipients SET delivery_status = 'skipped', last_error = 'Suppressed address', sent_at = NULL
          WHERE update_id = ${id} AND lower(email) = ${r.email}`
        continue
      }
      try {
        const result = await sendEmail({ to: r.email, subject: snapshot.title,
          text: [snapshot.body, snapshot.asks ? `Asks:\n${snapshot.asks}` : ""].filter(Boolean).join("\n\n"),
          trackingId: r.trackingId, messageId: `<${r.trackingId}@an-ker.de>`, idempotencyKey: `investor-update:${id}:${r.trackingId}`,
          signal: AbortSignal.timeout(25000),
        })
        await sql`UPDATE investor_update_recipients SET delivery_status = 'sent', resend_id = ${result.resendId}, sent_at = now(), last_error = NULL
          WHERE update_id = ${id} AND lower(email) = ${r.email}`
      } catch (e) {
        const error = e instanceof Error ? e.message.slice(0, 400) : "Delivery failed"
        await sql`UPDATE investor_update_recipients SET delivery_status = 'failed', last_error = ${error}
          WHERE update_id = ${id} AND lower(email) = ${r.email} AND delivery_status <> 'sent'`
      }
    }
    const [counts] = await sql`SELECT count(*) FILTER (WHERE delivery_status = 'sent')::int AS sent,
      count(*) FILTER (WHERE delivery_status = 'skipped')::int AS skipped FROM investor_update_recipients WHERE update_id = ${id}`
    const sent = Number(counts.sent), skipped = Number(counts.skipped)
    const remaining = snapshot.recipients.length - sent - skipped
    const complete = remaining === 0 && sent > 0
    const note = complete ? null : remaining ? `${remaining} deliveries need retry.` : "No messages sent. All recipients were suppressed."
    await sql`UPDATE investor_updates SET status = ${complete ? "sent" : "partial"}, send_token = NULL, send_lease_until = NULL,
      sent_at = CASE WHEN ${complete} THEN now() ELSE sent_at END, last_error = ${note}, updated_at = now()
      WHERE id = ${id} AND user_id = ${user.id} AND send_token = ${token}`
    return NextResponse.json({ ok: complete, sent, skipped, remaining, error: note }, { status: complete ? 200 : 502 })
  } catch (e) {
    if (claimed) await sql`UPDATE investor_updates SET status = 'partial', send_token = NULL, send_lease_until = NULL,
      last_error = 'Delivery interrupted. Retry uses the original content and recipients.', updated_at = now()
      WHERE id = ${id} AND user_id = ${user.id} AND send_token = ${token}`.catch(() => {})
    console.error("[investor update delivery]", e)
    return NextResponse.json({ error: "Delivery interrupted. Reload to review its status before retrying." }, { status: 503 })
  }
}

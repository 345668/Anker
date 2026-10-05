import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUpdateWorkspace } from "@/lib/updates/workspace"
import { workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
import { sendEmail, isResendConfigured } from "@/lib/email/resend"
import { isEmailSuppressed } from "@/lib/outreach/deliverability"
import { sendRequest, type SendSnapshot } from "@/lib/updates/send-contract"
import { randomUUID } from "node:crypto"
import { classifySendError } from "@/lib/email/send-errors"
import { openAuthorization, markSending, settleItem, closeAuthorization } from "@/lib/outreach/send-auth/inline"
import { withSendAuthorization } from "@/lib/outreach/send-auth/context"

export const runtime = "nodejs"
export const maxDuration = 300
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
  const { id } = await params
  const scope = await requireUpdateWorkspace(true, true)
  const user = { id: scope.userId }
  // Check before claiming or writing ANY sent state.
  if (!isResendConfigured()) return NextResponse.json({ error: "Email delivery is unavailable. Your update has not been sent." }, { status: 503 })
  const parsed = sendRequest.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Review the content, recipients and saved revision before sending." }, { status: 400 })
  const input = parsed.data, token = randomUUID()
  let claimed = false
  try {
    const [current] = await sql`SELECT * FROM investor_updates WHERE id = ${id} AND org_id = ${scope.orgId}`
    if (!current) return NextResponse.json({ error: "Update not found." }, { status: 404 })
    let snapshot = current.delivery_snapshot as SendSnapshot | null
    if (!snapshot) {
      if (!input.content || !input.recipients?.length) return NextResponse.json({ error: "Review and select at least one recipient." }, { status: 400 })
      const contactIds = input.recipients.flatMap(r => r.crmEntryId ? [r.crmEntryId] : [])
      const contacts = contactIds.length ? await sql`SELECT id FROM crm_entries WHERE org_id=${scope.orgId} AND id=ANY(${contactIds}::text[])` : []
      if (new Set(contacts.map(r => r.id)).size !== new Set(contactIds).size) return NextResponse.json({ error: "A recipient belongs to another workspace or is no longer available." }, { status: 403 })
      const unique = new Map(input.recipients.map(r => [r.email.toLowerCase(), { ...r, email: r.email.toLowerCase(), trackingId: randomUUID() }]))
      snapshot = { ...input.content, startedAt: new Date().toISOString(), senderUserId: user.id, recipients: [...unique.values()] }
    } else if (Date.now() - new Date(snapshot.startedAt).getTime() > 20 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "This delivery needs reconciliation before another retry. Check provider delivery records to avoid duplicate messages." }, { status: 409 })
    }
    const [update] = await sql`UPDATE investor_updates SET status = 'sending', send_token = ${token},
      send_lease_until = now() + interval '2 minutes', delivery_snapshot = coalesce(delivery_snapshot, ${JSON.stringify(snapshot)}::jsonb),
      title = ${snapshot.title}, body = ${snapshot.body}, asks = ${snapshot.asks}, revision = revision + 1, last_error = NULL, updated_at = now()
      WHERE id = ${id} AND org_id = ${scope.orgId} AND revision = ${input.revision}
        AND (status IN ('draft', 'partial') OR (status = 'sending' AND send_lease_until < now())) RETURNING *`
    if (!update) return NextResponse.json({ error: "Another request changed or is sending this update. Reload its delivery status." }, { status: 409 })
    claimed = true
    snapshot = update.delivery_snapshot as SendSnapshot
    // The founder's send of this update is the approval, and it covers exactly the frozen snapshot: one authorization per update, kept across retries, with one item per
    // recipient (docs/architecture/46 §17). If it cannot be recorded nothing is sent.
    const updateText = [snapshot.body, snapshot.asks ? `Asks:\n${snapshot.asks}` : ""].filter(Boolean).join("\n\n")
    const settledAlready = new Set(((await sql`SELECT lower(email) AS email FROM investor_update_recipients WHERE update_id = ${id} AND delivery_status IN ('sent','skipped')`) as any[]).map((x) => x.email))
    const auth = await openAuthorization({ orgId: scope.orgId, senderUserId: user.id, approvedBy: user.id, source: "investor_update", key: `update:${id}`, expiresHours: 24 * 7, itemStatus: "approved", actor: { userId: user.id },
      items: snapshot.recipients.filter((r) => !settledAlready.has(r.email.toLowerCase())).map((r) => ({ ref: `update:${id}:${r.trackingId}`, to: r.email, subject: snapshot.title, body: updateText, entryId: r.crmEntryId ?? null })), summary: { updateId: id } })
    const started = Date.now()
    let stopped: string | null = null // the sender is held (paused, plan or daily allowance): the rest wait, they are not marked failed
    for (const r of snapshot.recipients) {
      if (Date.now() - started > 230000) break
      const [lease] = await sql`UPDATE investor_updates SET send_lease_until = now() + interval '2 minutes'
        WHERE id = ${id} AND org_id = ${scope.orgId} AND send_token = ${token}
          AND EXISTS (SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.org_id
            WHERE m.user_id=${user.id} AND m.org_id=${scope.orgId} AND m.persona='founder'
              AND m.org_role IN ('workspace_owner','admin','member') AND m.can_send_outreach=true AND o.archived_at IS NULL) RETURNING id`
      if (!lease) throw new Error("Delivery ownership changed. Reload before retrying.")
      const [existing] = await sql`SELECT delivery_status FROM investor_update_recipients WHERE update_id = ${id} AND lower(email) = ${r.email}`
      if (["sent", "skipped"].includes(existing?.delivery_status)) continue
      await sql`INSERT INTO investor_update_recipients(update_id, user_id, crm_entry_id, email, name, tracking_id, delivery_status, sent_at)
        VALUES (${id}, ${snapshot.senderUserId || current.user_id}, ${r.crmEntryId ?? null}, ${r.email}, ${r.name ?? null}, ${r.trackingId}, 'pending', NULL)
        ON CONFLICT (update_id, lower(email)) WHERE email IS NOT NULL DO NOTHING`
      if (await isEmailSuppressed(snapshot.senderUserId || current.user_id, r.email)) {
        await sql`UPDATE investor_update_recipients SET delivery_status = 'skipped', last_error = 'Suppressed address', sent_at = NULL
          WHERE update_id = ${id} AND lower(email) = ${r.email}`
        await settleItem(auth.id, `update:${id}:${r.trackingId}`, { status: "blocked", reason: "Suppressed address" })
        continue
      }
      const ref = `update:${id}:${r.trackingId}`
      await markSending(auth.id, ref)
      try {
        const result = await withSendAuthorization(auth.id, () => sendEmail({ purpose: "outreach", via: "investor-update", senderUserId: user.id, to: r.email, subject: snapshot.title,
          text: updateText,
          trackingId: r.trackingId, messageId: `<${r.trackingId}@an-ker.de>`, idempotencyKey: `investor-update:${id}:${r.trackingId}`,
          signal: AbortSignal.timeout(25000),
        }))
        await settleItem(auth.id, ref, { status: "sent", providerId: result.resendId, providerMessageId: result.messageId })
        await sql`UPDATE investor_update_recipients SET delivery_status = 'sent', resend_id = ${result.resendId}, sent_at = now(), last_error = NULL
          WHERE update_id = ${id} AND lower(email) = ${r.email}`
      } catch (e) {
        // A recipient who opted out, or who needs recorded consent, is skipped with the reason (it was retried as a "failure" forever before);
        // a held sender stops the loop and leaves the rest pending; only a real delivery error is a failure to retry (lib/email/send-errors.ts).
        const c = classifySendError(e)
        if (c.kind === "skip") {
          await sql`UPDATE investor_update_recipients SET delivery_status = 'skipped', last_error = ${c.reason}, sent_at = NULL
            WHERE update_id = ${id} AND lower(email) = ${r.email} AND delivery_status <> 'sent'`
          await settleItem(auth.id, ref, { status: "blocked", reason: c.reason })
        } else if (c.kind === "stop") {
          stopped = c.reason
          await sql`UPDATE send_items SET status = 'approved', claimed_at = NULL WHERE authorization_id = ${auth.id} AND message_id = ${ref} AND status = 'sending'`
          break
        } else {
          await sql`UPDATE investor_update_recipients SET delivery_status = 'failed', last_error = ${c.message}
            WHERE update_id = ${id} AND lower(email) = ${r.email} AND delivery_status <> 'sent'`
          await settleItem(auth.id, ref, { status: "failed", reason: c.message.slice(0, 300) })
        }
      }
    }
    if (!stopped) await closeAuthorization(auth.id).catch(() => {})
    const [counts] = await sql`SELECT count(*) FILTER (WHERE delivery_status = 'sent')::int AS sent,
      count(*) FILTER (WHERE delivery_status = 'skipped')::int AS skipped FROM investor_update_recipients WHERE update_id = ${id}`
    const sent = Number(counts.sent), skipped = Number(counts.skipped)
    const remaining = snapshot.recipients.length - sent - skipped
    const complete = remaining === 0 && sent > 0
    const note = complete ? null : stopped ? `Sending stopped: ${stopped} ${remaining} not sent yet; retry when it is resolved.` : remaining ? `${remaining} deliveries need retry.` : "No messages sent. Every recipient was skipped; the reason is shown against each one."
    await sql`UPDATE investor_updates SET status = ${complete ? "sent" : "partial"}, send_token = NULL, send_lease_until = NULL,
      sent_at = CASE WHEN ${complete} THEN now() ELSE sent_at END, last_error = ${note}, updated_at = now()
      WHERE id = ${id} AND org_id = ${scope.orgId} AND send_token = ${token}`
    return NextResponse.json({ ok: complete, sent, skipped, remaining, stopped, error: note }, { status: complete ? 200 : 502 })
  } catch (e) {
    if (claimed) await sql`UPDATE investor_updates SET status = 'partial', send_token = NULL, send_lease_until = NULL,
      last_error = 'Delivery interrupted. Retry uses the original content and recipients.', updated_at = now()
      WHERE id = ${id} AND org_id = ${scope.orgId} AND send_token = ${token}`.catch(() => {})
    console.error("[investor update delivery]", e)
    return NextResponse.json({ error: "Delivery interrupted. Reload to review its status before retrying." }, { status: 503 })
  }
  } catch (error) { return workspaceError(error) }
}

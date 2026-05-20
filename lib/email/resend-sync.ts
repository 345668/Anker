/**
 * Resend events sync — outbound polling against the Resend REST API.
 *
 * Designed for the localhost dev workflow where webhooks can't reach
 * the app.  We periodically GET /emails/:id for each in-flight
 * outreach_messages row and translate Resend's last_event into our
 * own outreach_events + counter columns.
 *
 * Resend's GET /emails/:id response shape (relevant fields only):
 *   {
 *     id: string,
 *     to: string[],
 *     from: string,
 *     subject: string,
 *     created_at: ISO,
 *     last_event: "sent" | "delivered" | "delivery_delayed"
 *                | "complained" | "bounced" | "opened" | "clicked",
 *   }
 *
 * We don't have access to individual event timestamps via this endpoint
 * (Resend only exposes the per-event log via webhooks).  So this poller
 * tracks the LATEST state plus a count-increment heuristic: every time
 * we see last_event=opened and our local opens=0, we record one open
 * event.  Repeat opens require webhooks for true counts; for now,
 * "opened: ≥1" is what we need for the inbox UI.
 */

import { sql } from "@/lib/db"
import { isResendConfigured } from "./resend"

const RESEND_API = "https://api.resend.com/emails"
const DEFAULT_INTERVAL_MIN = 5
const DEFAULT_BATCH = 50

export type ResendLastEvent =
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "complained"
  | "bounced"
  | "opened"
  | "clicked"
  | "replied"
  | string   // forward-compat for new event types

export interface ResendEmailGet {
  id: string
  to?: string[] | string
  from?: string
  subject?: string
  created_at?: string
  last_event?: ResendLastEvent
}

export interface SyncResult {
  configured: boolean
  fetched: number
  updated: number
  newOpens: number
  newClicks: number
  newBounces: number
  newDelivered: number
  newComplained: number
  errors: { messageId: string; error: string }[]
  durationMs: number
}

/** Map Resend's last_event into one of our outreach_events.kind values. */
function eventKindFromResend(ev: string | undefined): string | null {
  switch (ev) {
    case "opened":    return "open"
    case "clicked":   return "click"
    case "bounced":   return "bounce"
    case "complained":return "spam"
    case "delivered": return "delivered"
    case "replied":   return null  // replies need full body — handled separately
    default: return null
  }
}

/** Map last_event into the outreach_messages.status enum. */
function statusFromResend(ev: string | undefined, current: string): string {
  // Don't move backward.  Once delivered/replied/etc., stay there.
  const order = ["draft","approved","queued","sent","delivered","opened","clicked","replied","accepted","bounced","failed","complained","cancelled"]
  const candidate = ev === "bounced" ? "bounced"
                  : ev === "complained" ? "complained"
                  : ev === "delivered" ? "delivered"
                  : ev === "replied" ? "replied"
                  : current
  const a = order.indexOf(current); const b = order.indexOf(candidate)
  return b > a ? candidate : current
}

async function fetchOne(resendId: string, apiKey: string): Promise<ResendEmailGet> {
  const res = await fetch(`${RESEND_API}/${encodeURIComponent(resendId)}`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new Error(`Resend GET /emails/${resendId} ${res.status}: ${txt.slice(0, 300)}`)
  }
  return (await res.json()) as ResendEmailGet
}

/** Sync events for sent emails that are due for a poll. */
export async function syncResendEvents(opts: {
  /** Max messages to poll in this run. */
  limit?: number
  /** Only re-poll messages last synced more than `intervalMin` ago. */
  intervalMin?: number
  /** Force re-poll regardless of last_resend_sync_at. */
  force?: boolean
  /** Restrict to a single message — useful for the row-level
   *  "Sync now" button. */
  messageId?: string
} = {}): Promise<SyncResult> {
  const t0 = Date.now()
  const apiKey = process.env.RESEND_API_KEY ?? ""

  if (!isResendConfigured()) {
    return baseResult(t0, { configured: false })
  }
  const cap = Math.max(1, Math.min(500, opts.limit ?? DEFAULT_BATCH))
  const intervalMin = Math.max(0, opts.intervalMin ?? DEFAULT_INTERVAL_MIN)

  let rows: any[]
  if (opts.messageId) {
    rows = await sql`
      SELECT id, resend_id, status, opens, clicks
      FROM outreach_messages
      WHERE id = ${opts.messageId} AND channel = 'email' AND resend_id IS NOT NULL
      LIMIT 1`
  } else if (opts.force) {
    rows = await sql`
      SELECT id, resend_id, status, opens, clicks
      FROM outreach_messages
      WHERE channel = 'email'
        AND resend_id IS NOT NULL
        AND resend_id NOT LIKE 'dryrun:%'
        AND status NOT IN ('failed','cancelled','complained')
      ORDER BY last_resend_sync_at NULLS FIRST, sent_at DESC NULLS LAST
      LIMIT ${cap}`
  } else {
    rows = await sql`
      SELECT id, resend_id, status, opens, clicks
      FROM outreach_messages
      WHERE channel = 'email'
        AND resend_id IS NOT NULL
        AND resend_id NOT LIKE 'dryrun:%'
        AND status NOT IN ('failed','cancelled','complained')
        AND (last_resend_sync_at IS NULL
             OR last_resend_sync_at < NOW() - (${intervalMin} || ' minutes')::interval)
      ORDER BY last_resend_sync_at NULLS FIRST, sent_at DESC NULLS LAST
      LIMIT ${cap}`
  }

  const result: SyncResult = {
    configured: true,
    fetched: rows.length,
    updated: 0,
    newOpens: 0, newClicks: 0, newBounces: 0,
    newDelivered: 0, newComplained: 0,
    errors: [],
    durationMs: 0,
  }

  for (const r of rows as any[]) {
    try {
      const data = await fetchOne(r.resend_id, apiKey)
      const ev = data.last_event
      const newStatus = statusFromResend(ev, r.status)

      // First-event accounting — only increment counters if Resend now
      // reports an event we haven't seen yet.
      let opensInc = 0, clicksInc = 0
      if (ev === "opened" && Number(r.opens) === 0) opensInc = 1
      if (ev === "clicked" && Number(r.clicks) === 0) clicksInc = 1

      const kind = eventKindFromResend(ev)
      if (kind) {
        // De-dupe by composing a synthetic provider_event_id so
        // re-syncs don't double-insert.
        await sql`
          INSERT INTO outreach_events (message_id, kind, provider_event_id, occurred_at)
          VALUES (${r.id}, ${kind}, ${`resend:${r.resend_id}:${kind}`}, NOW())
          ON CONFLICT (provider_event_id) DO NOTHING`
      }

      // Counter bumps + status forward-progress.
      if (opensInc) result.newOpens++
      if (clicksInc) result.newClicks++
      if (kind === "bounce") result.newBounces++
      if (kind === "delivered") result.newDelivered++
      if (kind === "spam") result.newComplained++

      await sql`
        UPDATE outreach_messages SET
          status              = ${newStatus},
          opens               = opens + ${opensInc},
          clicks              = clicks + ${clicksInc},
          last_opened_at      = CASE WHEN ${opensInc} > 0 THEN NOW() ELSE last_opened_at END,
          last_clicked_at     = CASE WHEN ${clicksInc} > 0 THEN NOW() ELSE last_clicked_at END,
          failed_reason       = CASE WHEN ${ev === "bounced"} THEN COALESCE(failed_reason, 'bounce reported by Resend') ELSE failed_reason END,
          last_resend_sync_at = NOW(),
          updated_at          = NOW()
        WHERE id = ${r.id}`
      result.updated++
    } catch (e: any) {
      result.errors.push({ messageId: r.id, error: e?.message ?? "unknown error" })
      // Still bump last_resend_sync_at so we don't hammer the same broken
      // message every cycle.
      await sql`UPDATE outreach_messages SET last_resend_sync_at = NOW() WHERE id = ${r.id}`
    }
  }

  result.durationMs = Date.now() - t0
  return result
}

function baseResult(t0: number, extra: Partial<SyncResult> = {}): SyncResult {
  return {
    configured: false,
    fetched: 0, updated: 0,
    newOpens: 0, newClicks: 0, newBounces: 0,
    newDelivered: 0, newComplained: 0,
    errors: [],
    durationMs: Date.now() - t0,
    ...extra,
  }
}

/**
 * Email-tracking event recorder.
 *
 * Both tracking routes (/api/track/open/:id.gif and
 * /api/track/click/:id) call into this module so we have a single place
 * to:
 *   • look up the outreach_messages row by tracking_id
 *   • insert into outreach_events
 *   • bump opens/clicks counters + last_*_at on outreach_messages
 *   • mark the message as 'replied' is NOT done here — that's the IMAP poller's job
 *
 * Bot-filter heuristics (User-Agent based) prevent obvious prefetch
 * scanners from inflating counts.  We still log the event so the count
 * mismatch is visible in /dashboard/admin/inbox.
 */

import { sql } from "@/lib/db"

const BOT_UA_RX = /(GoogleImageProxy|ProofPoint|Mimecast|Barracuda|Symantec|Sophos|Trend Micro|MailScanner|McAfee|FireEye|Skylight|Trustwave|Bitdefender|GoBuster|MS-Office|Outlook-iOS\/[^\s]+ Test)/i

export interface TrackEventInput {
  trackingId: string
  ip?: string | null
  userAgent?: string | null
  url?: string | null  // click events only
}

export interface TrackEventResult {
  ok: boolean
  messageId: string | null
  isBot: boolean
  reason?: string
}

/** Look up message by tracking_id.  Returns null if not found. */
async function lookupMessage(trackingId: string): Promise<{ id: string; opens: number; clicks: number } | null> {
  const [row] = await sql`
    SELECT id, opens, clicks FROM outreach_messages WHERE tracking_id = ${trackingId} LIMIT 1
  `
  if (!row) return null
  return { id: (row as any).id, opens: Number((row as any).opens) || 0, clicks: Number((row as any).clicks) || 0 }
}

export async function recordOpen(input: TrackEventInput): Promise<TrackEventResult> {
  const msg = await lookupMessage(input.trackingId)
  if (!msg) return { ok: false, messageId: null, isBot: false, reason: "unknown tracking_id" }

  const isBot = BOT_UA_RX.test(input.userAgent ?? "")
  await sql`
    INSERT INTO outreach_events (message_id, kind, ip, user_agent, occurred_at)
    VALUES (${msg.id}, 'open', ${input.ip ?? null}, ${input.userAgent ?? null}, NOW())
  `
  if (!isBot) {
    await sql`
      UPDATE outreach_messages SET
        opens          = opens + 1,
        last_opened_at = NOW(),
        updated_at     = NOW()
      WHERE id = ${msg.id}
    `
  }
  return { ok: true, messageId: msg.id, isBot, reason: isBot ? "bot UA — event logged, count not bumped" : undefined }
}

export async function recordClick(input: TrackEventInput): Promise<TrackEventResult> {
  const msg = await lookupMessage(input.trackingId)
  if (!msg) return { ok: false, messageId: null, isBot: false, reason: "unknown tracking_id" }

  const isBot = BOT_UA_RX.test(input.userAgent ?? "")
  await sql`
    INSERT INTO outreach_events (message_id, kind, url, ip, user_agent, occurred_at)
    VALUES (${msg.id}, 'click', ${input.url ?? null}, ${input.ip ?? null}, ${input.userAgent ?? null}, NOW())
  `
  if (!isBot) {
    await sql`
      UPDATE outreach_messages SET
        clicks          = clicks + 1,
        last_clicked_at = NOW(),
        updated_at      = NOW()
      WHERE id = ${msg.id}
    `
  }
  return { ok: true, messageId: msg.id, isBot, reason: isBot ? "bot UA — event logged, count not bumped" : undefined }
}

/** A single 1×1 transparent GIF (43 bytes).  Used by the open-tracking
 *  route to ship a real image regardless of DB state. */
export const PIXEL_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61,             // GIF89a
  0x01, 0x00, 0x01, 0x00,                         // 1x1
  0x80, 0x00, 0x00,                               // gct: 2 colors
  0x00, 0x00, 0x00, 0xff, 0xff, 0xff,             // black, white
  0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, // graphic control ext (transparent)
  0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, // image descriptor
  0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00,       // image data (1 px transparent)
  0x3b,                                           // trailer
])

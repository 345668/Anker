/**
 * Resend sender + tracking injection.
 *
 * Thin wrapper around the Resend HTTP API.  Adds:
 *   • 1×1 transparent tracking pixel keyed by `trackingId`
 *   • link rewriting through /api/track/click/<trackingId>?url=…
 *   • RFC 2822 threading headers (Message-ID, In-Reply-To, References)
 *   • Reply-To = OUTREACH_FROM_EMAIL so IMAP picks up replies on our box
 *
 * Env:
 *   RESEND_API_KEY              required — throws error if missing
 *   OUTREACH_FROM_EMAIL         vc@an-ker.de
 *   OUTREACH_FROM_NAME          "Anker"
 *   APP_URL                     https://anker.example.com — used for the
 *                               tracking pixel + click redirect.
 */

import { randomUUID } from "node:crypto"

const RESEND_API = "https://api.resend.com/emails"

export interface SendEmailInput {
  to: string
  subject: string
  /** HTML body — we inject pixel + rewrite links here. */
  html?: string
  /** Plain-text alternative — recommended for deliverability. */
  text?: string
  /** Internal id used for /track URLs.  Auto-generated if missing. */
  trackingId?: string
  /** For follow-ups: the Message-ID we previously sent, used as
   *  In-Reply-To + appended to References. */
  inReplyTo?: string
  /** Optional explicit Message-ID — otherwise we generate one. */
  messageId?: string
  /** Override From — defaults to env. */
  from?: string
  /** Override Reply-To — defaults to From. */
  replyTo?: string
  /** Skip tracking injection (use for transactional / system mail). */
  noTracking?: boolean
  /** CC recipients — every send for the campaign goes to these as well.  Useful
   *  for keeping a colleague in the loop without giving them CRM access. */
  cc?: string[]
  /** BCC recipients — same idea but the primary recipient does not see them. */
  bcc?: string[]
  /** File attachments — content is base64-encoded. Used for LP notice PDFs. */
  attachments?: { filename: string; content: string }[]
}

export interface SendEmailResult {
  resendId: string         // Resend's email ID
  messageId: string        // the RFC 2822 Message-ID we set
  trackingId: string       // useful for the caller to persist
  finalFrom: string
  finalReplyTo: string
  finalSubject: string
  finalHtml: string
  finalText: string
  /** Final CC list actually sent (post de-dupe).  [] when no CCs configured. */
  finalCc: string[]
  /** Final BCC list actually sent (post de-dupe).  [] when no BCCs configured. */
  finalBcc: string[]
}

const FROM_DEFAULT = "Anker <vc@an-ker.de>"
const APP_URL_FALLBACK = "http://localhost:3000"

function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || APP_URL_FALLBACK).replace(/\/$/, "")
}

function senderHeader(): string {
  const email = process.env.OUTREACH_FROM_EMAIL || "vc@an-ker.de"
  const name = process.env.OUTREACH_FROM_NAME || "Anker"
  return name ? `${name} <${email}>` : email
}

/** Domain used in the auto-generated Message-ID.  Derives from the
 *  sender address; falls back to `an-ker.de`. */
function messageIdHost(): string {
  const email = process.env.OUTREACH_FROM_EMAIL || "vc@an-ker.de"
  const at = email.indexOf("@")
  return at >= 0 ? email.slice(at + 1) : "an-ker.de"
}

function makeMessageId(): string {
  return `<${Date.now().toString(36)}.${randomUUID()}@${messageIdHost()}>`
}

/** Build the click-tracker URL. */
function clickUrl(trackingId: string, target: string): string {
  return `${appUrl()}/api/track/click/${encodeURIComponent(trackingId)}?url=${encodeURIComponent(target)}`
}
function pixelUrl(trackingId: string): string {
  return `${appUrl()}/api/track/open/${encodeURIComponent(trackingId)}.gif`
}

/** Rewrite <a href="X"> to use the click tracker.  Leaves mailto:,
 *  tel:, and the tracker itself alone. */
function rewriteLinks(html: string, trackingId: string): string {
  if (!html) return html
  return html.replace(
    /(<a\b[^>]*\shref=)(["'])([^"']+)\2/gi,
    (m, prefix, q, url) => {
      const u = String(url)
      if (
        u.startsWith("mailto:") ||
        u.startsWith("tel:") ||
        u.startsWith("#") ||
        u.startsWith("javascript:") ||
        u.includes("/api/track/")
      ) return m
      return `${prefix}${q}${clickUrl(trackingId, u)}${q}`
    },
  )
}

/** Append the 1×1 pixel just before </body>; tail-append if missing. */
function injectPixel(html: string, trackingId: string): string {
  const px = `<img src="${pixelUrl(trackingId)}" width="1" height="1" alt="" style="display:none;border:0;width:1px;height:1px" />`
  if (!html) return px
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${px}</body>`)
  return html + px
}

/** Light text→HTML: paragraph breaks on blank lines, preserve URLs. */
function textToHtml(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  // Linkify bare http(s) URLs
  const linked = esc.replace(/(https?:\/\/[^\s<>"']+)/g, '<a href="$1">$1</a>')
  return linked
    .split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px 0">${p.replace(/\n/g, "<br/>")}</p>`).join("")
}

/** Send.  Returns metadata for the caller to persist. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const trackingId = input.trackingId ?? randomUUID()
  const messageId = input.messageId ?? makeMessageId()
  const finalFrom = input.from ?? senderHeader() ?? FROM_DEFAULT
  const finalReplyTo = input.replyTo ?? finalFrom
  const finalSubject = input.subject || "(no subject)"

  // When TRACK_VIA_APP=true we inject our own 1×1 pixel + click rewriter
  // pointing at /api/track/*.  That requires APP_URL to be publicly
  // reachable by the recipient, which doesn't apply to a localhost-only
  // dev setup.  By default we rely on Resend's server-side open + click
  // tracking and pull the events via lib/email/resend-sync.ts.
  const trackViaApp = (process.env.TRACK_VIA_APP ?? "false") === "true"
  let html = input.html ?? (input.text ? textToHtml(input.text) : "")
  if (!input.noTracking && trackViaApp && html) {
    html = rewriteLinks(html, trackingId)
    html = injectPixel(html, trackingId)
  }
  const text = input.text ?? stripTags(html)

  // Normalise cc/bcc: trim, dedupe, drop empties / the primary recipient.
  // Done here so the dry-run path can surface what WOULD be sent.
  const cleanList = (raw: string[] | undefined): string[] => {
    if (!raw || !raw.length) return []
    const primary = String(input.to).toLowerCase().trim()
    const seen = new Set<string>()
    const out: string[] = []
    for (const r of raw) {
      const a = String(r ?? "").trim()
      if (!a) continue
      const lc = a.toLowerCase()
      if (lc === primary) continue
      if (seen.has(lc)) continue
      seen.add(lc)
      out.push(a)
    }
    return out
  }
  const cc  = cleanList(input.cc)
  const bcc = cleanList(input.bcc)

  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.error("[resend] RESEND_API_KEY is not configured - email will NOT be sent")
    throw new Error("RESEND_API_KEY is not configured. Please add your Resend API key to send emails.")
  }

  // Build threading headers — Resend accepts an arbitrary `headers` map.
  const headers: Record<string, string> = {
    "Message-ID": messageId,
    "X-Anker-Tracking-Id": trackingId,
  }
  if (input.inReplyTo) {
    headers["In-Reply-To"] = input.inReplyTo
    headers["References"] = input.inReplyTo
  }

  const body: Record<string, any> = {
    from: finalFrom,
    to: [input.to],
    reply_to: finalReplyTo,
    subject: finalSubject,
    html,
    text,
    headers,
    // Tags surface in Resend's dashboard + webhook payloads.  We tag
    // every send with the tracking_id so a later GET /emails/:id can
    // be cross-referenced even if Resend ever changes id format.
    tags: [
      { name: "tracking_id", value: trackingId },
      { name: "source",      value: "anker-outreach" },
    ],
  }
  if (cc.length)  body.cc  = cc
  if (bcc.length) body.bcc = bcc
  if (input.attachments?.length) body.attachments = input.attachments

  console.log(`[resend] Sending email to ${input.to} | subject: "${finalSubject}" | cc: ${cc.length} | bcc: ${bcc.length}`)

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new Error(`Resend ${res.status}: ${txt.slice(0, 400)}`)
  }
  const data = (await res.json().catch(() => ({}))) as any
  const resendId = String(data?.id ?? "")
  if (!resendId) throw new Error("Resend response missing id")

  console.log(`[resend] Email sent successfully | resendId: ${resendId} | to: ${input.to}`)

  return {
    resendId,
    messageId,
    trackingId,
    finalFrom,
    finalReplyTo,
    finalSubject,
    finalHtml: html,
    finalText: text,
    finalCc: cc,
    finalBcc: bcc,
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
}

/** True if the env is plausibly configured to actually send. */
export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}


// ── Delivery telemetry ───────────────────────────────────────────────────────

export interface ResendEmailStatus {
  id: string
  /** created | delivered | delivery_delayed | bounced | complained | opened | clicked | ... */
  lastEvent: string | null
}

/**
 * GET https://api.resend.com/emails/:id — Resend's per-email status.
 * `last_event` is their event machine's latest state; we fold it into
 * outreach_messages (delivered_at / bounced_at / complained_at / opens).
 */
export async function getResendEmail(id: string): Promise<ResendEmailStatus | null> {
  const key = process.env.RESEND_API_KEY
  if (!key || !id) return null
  const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) {
    if (res.status === 404) return { id, lastEvent: null }
    throw new Error(`Resend GET /emails/${id} -> ${res.status}`)
  }
  const j: any = await res.json().catch(() => ({}))
  return { id, lastEvent: typeof j?.last_event === "string" ? j.last_event : null }
}

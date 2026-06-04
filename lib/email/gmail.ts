/**
 * Gmail send via OAuth 2.0.
 *
 * Companion to lib/email/resend.ts.  Sends through the recipient user's
 * own Gmail mailbox (e.g. pj@summitventurestudio.com) using a stored
 * refresh token, so:
 *   1. The "From" is the connected mailbox, not Resend's domain.
 *   2. Folk's mailbox sync picks up the sent message automatically — no
 *      separate Folk API call needed.
 *   3. Reply-To threading + RFC 2822 headers stay native to Gmail.
 *
 * Env required (set in .env.local):
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *   GOOGLE_OAUTH_REDIRECT_URL    e.g. https://anker.example.com/api/auth/gmail/callback
 *
 * The actual access-token refresh happens here so callers don't have to
 * think about it — `sendGmail()` will refresh the token + persist the new
 * one back to the DB on every call where the cached one is within 60 s of
 * expiry.
 */

import { sql } from "@/lib/db"
import { randomUUID } from "node:crypto"

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
]

export interface GmailAccount {
  id: string
  user_id: string
  provider: "gmail"
  email: string
  display_name: string | null
  refresh_token: string
  access_token: string | null
  expires_at: Date | null
  scopes: string[]
  is_default: boolean
  status: "active" | "revoked" | "error"
  last_error: string | null
}

export interface SendGmailInput {
  account: GmailAccount
  to: string
  subject: string
  text?: string
  html?: string
  cc?: string[]
  bcc?: string[]
  inReplyTo?: string
  references?: string[]
  /** Header value to set explicitly; otherwise we generate one. */
  messageId?: string
  /** Internal tracking id surfaced as X-Anker-Tracking-Id. */
  trackingId?: string
}

export interface SendGmailResult {
  messageId: string          // RFC 2822 Message-ID we set
  gmailId: string            // Gmail's own message id
  threadId: string           // Gmail thread id (for follow-ups)
  trackingId: string
  finalFrom: string
  finalSubject: string
  finalText: string
  finalHtml: string
  finalCc: string[]
  finalBcc: string[]
}

export function isGmailOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REDIRECT_URL,
  )
}

export function gmailAuthUrl(opts: { state: string; loginHint?: string }): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URL!,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",  // force refresh_token issuance even if previously granted
    scope: GMAIL_SCOPES.join(" "),
    state: opts.state,
  })
  if (opts.loginHint) params.set("login_hint", opts.loginHint)
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

interface TokenExchangeResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
  id_token?: string
}

/** Exchange the OAuth `code` for tokens.  Used by the callback route. */
export async function exchangeCodeForTokens(code: string): Promise<{
  ok: true; access_token: string; refresh_token: string; expires_in: number; scope: string; id_token?: string
} | { ok: false; error: string }> {
  if (!isGmailOAuthConfigured()) return { ok: false, error: "Gmail OAuth not configured (set GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URL)" }
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URL!,
    grant_type: "authorization_code",
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const text = await res.text()
  if (!res.ok) return { ok: false, error: `token-exchange ${res.status}: ${text.slice(0, 240)}` }
  const json = JSON.parse(text) as TokenExchangeResponse
  if (!json.refresh_token) return { ok: false, error: "Google did not return a refresh_token (re-grant with prompt=consent)" }
  return {
    ok: true,
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
    scope: json.scope,
    id_token: json.id_token,
  }
}

/** Refresh the access token using the stored refresh token. */
async function refreshAccessToken(refreshToken: string): Promise<{
  ok: true; access_token: string; expires_in: number
} | { ok: false; error: string; status: number }> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const text = await res.text()
  if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 240) }
  const json = JSON.parse(text)
  return { ok: true, access_token: json.access_token, expires_in: json.expires_in }
}

/** Return a valid access token, refreshing + persisting if needed. */
async function ensureAccessToken(account: GmailAccount): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const skewMs = 60 * 1000
  const now = Date.now()
  if (account.access_token && account.expires_at && new Date(account.expires_at).getTime() > now + skewMs) {
    return { ok: true, token: account.access_token }
  }
  const r = await refreshAccessToken(account.refresh_token)
  if (!r.ok) {
    if (r.status === 400 || r.status === 401) {
      await sql`UPDATE email_oauth_accounts SET status='revoked', last_error=${r.error}, updated_at=NOW() WHERE id=${account.id}`
      return { ok: false, error: `refresh_token revoked or invalid: ${r.error}` }
    }
    return { ok: false, error: `refresh failed: ${r.error}` }
  }
  const expiresAt = new Date(now + (r.expires_in - skewMs) * 1000)
  await sql`UPDATE email_oauth_accounts SET access_token=${r.access_token}, expires_at=${expiresAt}, status='active', last_error=NULL, updated_at=NOW() WHERE id=${account.id}`
  return { ok: true, token: r.access_token }
}

/** Get account row from DB. */
export async function loadGmailAccount(opts: { accountId?: string; userId?: string; email?: string }): Promise<GmailAccount | null> {
  if (opts.accountId) {
    const [a] = await sql`SELECT * FROM email_oauth_accounts WHERE id=${opts.accountId} LIMIT 1` as any[]
    return a ?? null
  }
  if (opts.userId && opts.email) {
    const [a] = await sql`SELECT * FROM email_oauth_accounts WHERE user_id=${opts.userId} AND email=${opts.email} LIMIT 1` as any[]
    return a ?? null
  }
  if (opts.userId) {
    const [a] = await sql`SELECT * FROM email_oauth_accounts WHERE user_id=${opts.userId} AND is_default=true AND status='active' LIMIT 1` as any[]
    return a ?? null
  }
  return null
}

/** RFC 2822-encode + base64url for Gmail's send endpoint. */
function buildRawMime(input: SendGmailInput, messageId: string): string {
  const headers: string[] = []
  const from = input.account.display_name
    ? `${input.account.display_name} <${input.account.email}>`
    : input.account.email
  headers.push(`From: ${from}`)
  headers.push(`To: ${input.to}`)
  if (input.cc?.length)  headers.push(`Cc: ${input.cc.join(", ")}`)
  if (input.bcc?.length) headers.push(`Bcc: ${input.bcc.join(", ")}`)
  headers.push(`Subject: ${input.subject || "(no subject)"}`)
  headers.push(`Message-ID: ${messageId}`)
  if (input.inReplyTo)    headers.push(`In-Reply-To: ${input.inReplyTo}`)
  if (input.references?.length) headers.push(`References: ${input.references.join(" ")}`)
  if (input.trackingId)   headers.push(`X-Anker-Tracking-Id: ${input.trackingId}`)
  headers.push(`MIME-Version: 1.0`)

  const text = input.text ?? ""
  const html = input.html ?? ""
  let body: string
  if (text && html) {
    const boundary = "anker_" + randomUUID().replace(/-/g, "")
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    body =
      `--${boundary}\r\n` +
      `Content-Type: text/plain; charset="UTF-8"\r\n` +
      `Content-Transfer-Encoding: 7bit\r\n\r\n` +
      text + "\r\n" +
      `--${boundary}\r\n` +
      `Content-Type: text/html; charset="UTF-8"\r\n` +
      `Content-Transfer-Encoding: 7bit\r\n\r\n` +
      html + "\r\n" +
      `--${boundary}--`
  } else if (html) {
    headers.push(`Content-Type: text/html; charset="UTF-8"`)
    headers.push(`Content-Transfer-Encoding: 7bit`)
    body = html
  } else {
    headers.push(`Content-Type: text/plain; charset="UTF-8"`)
    headers.push(`Content-Transfer-Encoding: 7bit`)
    body = text
  }
  const mime = headers.join("\r\n") + "\r\n\r\n" + body
  // Gmail's API requires base64url (RFC 4648 §5)
  return Buffer.from(mime, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function defaultMessageId(domain: string): string {
  return `<${Date.now().toString(36)}.${randomUUID()}@${domain}>`
}

export async function sendGmail(input: SendGmailInput): Promise<{ ok: true; result: SendGmailResult } | { ok: false; error: string }> {
  if (input.account.status !== "active") return { ok: false, error: `account status=${input.account.status}: ${input.account.last_error ?? ""}` }
  const tok = await ensureAccessToken(input.account)
  if (!tok.ok) return { ok: false, error: tok.error }

  const messageId = input.messageId ?? defaultMessageId(input.account.email.split("@")[1] || "summitventurestudio.com")
  const trackingId = input.trackingId ?? randomUUID()
  const raw = buildRawMime({ ...input, trackingId }, messageId)

  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${tok.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  })
  const text = await res.text()
  if (!res.ok) {
    await sql`UPDATE email_oauth_accounts SET last_error=${text.slice(0, 500)}, updated_at=NOW() WHERE id=${input.account.id}`
    return { ok: false, error: `gmail ${res.status}: ${text.slice(0, 300)}` }
  }
  const json = JSON.parse(text)
  await sql`UPDATE email_oauth_accounts SET last_used_at=NOW(), last_error=NULL, updated_at=NOW() WHERE id=${input.account.id}`

  const from = input.account.display_name
    ? `${input.account.display_name} <${input.account.email}>`
    : input.account.email
  return {
    ok: true,
    result: {
      messageId,
      gmailId: json.id,
      threadId: json.threadId,
      trackingId,
      finalFrom: from,
      finalSubject: input.subject,
      finalText: input.text ?? "",
      finalHtml: input.html ?? "",
      finalCc: input.cc ?? [],
      finalBcc: input.bcc ?? [],
    },
  }
}

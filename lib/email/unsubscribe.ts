/**
 * Unsubscribe: signed links, the global do-not-send list, and the footer outreach carries.
 *
 * Why this exists (docs/architecture/37 §8.3): outreach email must carry a working unsubscribe, with a
 * `List-Unsubscribe` header and RFC 8058 one-click for mailbox providers, and a recipient who opts out must
 * stop receiving EVERY Anker outreach email, not only the sender's. Only four of eight send paths checked the
 * suppression list before this; the check now lives in `sendEmail` itself.
 *
 * A link is a signed token (HMAC over the address and a timestamp), so it needs no database row to verify and
 * cannot be forged for another address. It does not expire: an old email must still be able to unsubscribe.
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import { sql } from "@/lib/db"

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url")
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8")

function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.SECRET_KEY
  if (!s) throw new Error("UNSUBSCRIBE_SECRET or SECRET_KEY is required to sign unsubscribe links")
  return s
}
const sign = (payload: string) => createHmac("sha256", secret()).update(`unsub:${payload}`).digest("base64url")

export const normEmail = (e: string) => String(e ?? "").trim().toLowerCase()

/** `<address>.<time>.<signature>`; the address is encoded so the token is URL-safe. */
export function makeUnsubscribeToken(email: string, at = Date.now()): string {
  const payload = `${b64(normEmail(email))}.${at.toString(36)}`
  return `${payload}.${sign(payload)}`
}

/** The address a valid token names, or null for anything tampered, truncated or unsigned. */
export function readUnsubscribeToken(token: string): string | null {
  const parts = String(token ?? "").split(".")
  if (parts.length !== 3) return null
  const [a, t, sig] = parts
  const expected = sign(`${a}.${t}`)
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  const email = unb64(a)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function baseUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.an-ker.de").replace(/\/$/, "")
}

export const unsubscribeUrl = (email: string) => `${baseUrl()}/api/public/unsubscribe?t=${makeUnsubscribeToken(email)}`

/** The headers mailbox providers look for. https only: a mailto form would need an inbox we do not parse. */
export function unsubscribeHeaders(email: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(email)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}

/** The visible footer: who sent it, how to stop it, where the privacy notice is. Address comes from OUTREACH_FOOTER_ADDRESS. */
export function unsubscribeFooter(email: string): { text: string; html: string } {
  const url = unsubscribeUrl(email)
  const privacy = `${baseUrl()}/privacy`
  const address = (process.env.OUTREACH_FOOTER_ADDRESS || "").trim()
  const text = [
    "",
    "--",
    "Sent through Anker AI (an-ker.de).",
    ...(address ? [address] : []),
    `Do not want emails like this? Unsubscribe: ${url}`,
    `Privacy notice: ${privacy}`,
  ].join("\n")
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const html =
    `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:12px;color:#666">` +
    `Sent through Anker AI (an-ker.de).${address ? `<br/>${esc(address)}` : ""}<br/>` +
    `Do not want emails like this? <a href="${url}">Unsubscribe</a> · <a href="${privacy}">Privacy notice</a></div>`
  return { text, html }
}

/** Is this address on the GLOBAL do-not-send list (the rows with no owner)? Never throws. */
export async function isGloballySuppressed(email: string): Promise<boolean> {
  const e = normEmail(email)
  if (!e) return false
  try {
    const rows = (await sql`SELECT 1 FROM email_suppressions WHERE lower(email) = ${e} AND user_id IS NULL LIMIT 1`) as any[]
    return rows.length > 0
  } catch {
    return false
  }
}

/** Add an address to the global list. A NULL owner never collides in a unique index, so check first. */
export async function suppressGlobally(email: string, reason: string, source: string): Promise<boolean> {
  const e = normEmail(email)
  if (!e) return false
  await sql`
    INSERT INTO email_suppressions (user_id, email, reason, source, created_at)
    SELECT NULL, ${e}, ${reason}, ${source}, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM email_suppressions WHERE user_id IS NULL AND lower(email) = ${e})`
  return true
}

/** Thrown by sendEmail when an outreach recipient has opted out. Callers treat it as "skipped", not as a failure to retry. */
export class SuppressedRecipientError extends Error {
  readonly code = "recipient_suppressed"
  constructor(readonly email: string) { super("Recipient has opted out of Anker outreach email."); this.name = "SuppressedRecipientError" }
}

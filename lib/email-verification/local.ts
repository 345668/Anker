/**
 * Stage 1 — free, local checks (doc 13 §2). Settles what can be settled
 * without a provider: bad syntax, known bounces and suppressions, disposable
 * domains, role addresses, and domains that cannot receive mail. Everything
 * that passes is "unknown" — the mailbox itself is unconfirmed.
 */
import { promises as dns } from "node:dns"
import { classifyFormat } from "@/lib/outreach/email-quality"
import type { VerificationStatus } from "./types"

export interface LocalResult {
  status: VerificationStatus
  reason: string | null
  domain: string
  mxFound: boolean | null
}

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com",
  "trashmail.com", "getnada.com", "sharklasers.com", "dispostable.com", "maildrop.cc", "fakeinbox.com",
  "throwawaymail.com", "mailnesia.com", "mintemail.com", "discard.email", "spamgourmet.com", "emailondeck.com",
])

export type MxResolver = (domain: string) => Promise<boolean>

/** MX lookup with a timeout; an A/AAAA record also receives mail (RFC 5321 §5.1). */
export const defaultMxResolver: MxResolver = async (domain) => {
  const withTimeout = <T,>(p: Promise<T>, ms: number) =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))])
  try {
    const mx = await withTimeout(dns.resolveMx(domain), 4000)
    if (mx.length) return true
  } catch { /* fall through to A */ }
  try {
    const a = await withTimeout(dns.resolve4(domain), 4000)
    return a.length > 0
  } catch {
    return false
  }
}

export async function localCheck(
  email: string,
  ctx: { bounced: Set<string>; suppressed: Set<string>; mx: MxResolver; mxCache: Map<string, Promise<boolean>> },
): Promise<LocalResult> {
  const f = classifyFormat(email)
  const domain = (email.split("@")[1] ?? "").toLowerCase()
  if (f.status === "no_email" || f.status === "format_invalid") return { status: "invalid", reason: "syntax", domain, mxFound: null }
  if (ctx.suppressed.has(email)) return { status: "invalid", reason: "suppressed", domain, mxFound: null }
  if (ctx.bounced.has(email)) return { status: "invalid", reason: "bounced", domain, mxFound: null }
  if (DISPOSABLE.has(domain)) return { status: "risky", reason: "disposable", domain, mxFound: null }
  if (!ctx.mxCache.has(domain)) ctx.mxCache.set(domain, ctx.mx(domain))
  const mxFound = await ctx.mxCache.get(domain)!
  if (!mxFound) return { status: "invalid", reason: "no_mx", domain, mxFound: false }
  if (f.status === "role") return { status: "risky", reason: "role", domain, mxFound: true }
  return { status: "unknown", reason: "mailbox_unconfirmed", domain, mxFound: true }
}

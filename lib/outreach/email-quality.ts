/**
 * Local (no-paid-service) email quality pipeline.
 *
 * Four gates, applied in order — first one that fails sets the status:
 *   1. format_invalid   — regex fails
 *   2. role             — info@ / contact@ / hello@ / admin@ / noreply@ etc.
 *   3. bounced_june     — was in the prior campaign's hard-bounce list
 *   4. no_mx            — no MX record for the domain (or DNS fails)
 *   → otherwise         → valid  (best guess without paid verifier)
 *
 * Intended runtime: Node (Next.js API route). Uses Node's built-in `dns`
 * for MX lookups so no extra deps.
 */
import { promises as dnsPromises } from "node:dns"

export type EmailStatus =
  | "no_email"
  | "format_invalid"
  | "role"
  | "bounced_june"
  | "no_mx"
  | "valid"

export interface VerifyResult {
  status: EmailStatus
  reason: string
}

const ROLE_LOCAL_PARTS = new Set([
  "info", "contact", "hello", "hi", "admin", "office",
  "noreply", "no-reply", "donotreply", "do-not-reply",
  "support", "help", "sales", "billing", "team",
  "press", "media", "marketing", "hr", "jobs", "careers",
])

// Simple but effective — allows internationalized locals and 2+ char TLDs.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function classifyFormat(email: string | null | undefined): { status: EmailStatus; reason: string; local?: string; domain?: string } {
  if (!email) return { status: "no_email", reason: "No email on file" }
  const trimmed = email.trim().toLowerCase()
  if (!EMAIL_RE.test(trimmed)) {
    return { status: "format_invalid", reason: "Address does not look like a valid email" }
  }
  const [local, domain] = trimmed.split("@")
  if (ROLE_LOCAL_PARTS.has(local)) {
    return { status: "role", reason: `Role address (${local}@) — no personal recipient`, local, domain }
  }
  return { status: "valid", reason: "Format ok, not a role address", local, domain }
}

/**
 * Batched verification with a per-domain MX cache. Bounces are supplied as
 * a Set of normalized-lowercase emails (from outreach_messages joined with
 * bounced_at IS NOT NULL, or from the Resend telemetry JSON).
 *
 * concurrencyPerBatch caps parallel DNS lookups so we don't storm the
 * resolver.
 */
export async function verifyEmails(
  emails: Array<string | null | undefined>,
  bounced: Set<string>,
  opts: { concurrencyPerBatch?: number } = {},
): Promise<VerifyResult[]> {
  const conc = Math.max(1, Math.min(50, opts.concurrencyPerBatch ?? 20))

  // Step 1: fast classify. Collect unique domains that need MX lookup.
  const preliminaries = emails.map((e) => classifyFormat(e))
  const domainsNeedingMx = new Set<string>()
  preliminaries.forEach((p, i) => {
    if (p.status === "valid" && p.domain) {
      const em = (emails[i] || "").trim().toLowerCase()
      if (bounced.has(em)) return  // will short-circuit below
      domainsNeedingMx.add(p.domain)
    }
  })

  // Step 2: MX lookups, concurrency-limited.
  const mxCache = new Map<string, boolean>()
  const domainsArr = Array.from(domainsNeedingMx)
  for (let i = 0; i < domainsArr.length; i += conc) {
    const chunk = domainsArr.slice(i, i + conc)
    await Promise.all(chunk.map(async (d) => {
      try {
        const records = await dnsPromises.resolveMx(d)
        mxCache.set(d, records.length > 0)
      } catch {
        mxCache.set(d, false)
      }
    }))
  }

  // Step 3: assemble final results.
  return preliminaries.map((p, i) => {
    if (p.status !== "valid") return { status: p.status, reason: p.reason }
    const em = (emails[i] || "").trim().toLowerCase()
    if (bounced.has(em)) return { status: "bounced_june", reason: "Hard-bounced in the June batch — do not resend" }
    if (p.domain && mxCache.get(p.domain) === false) {
      return { status: "no_mx", reason: `Domain ${p.domain} has no MX record` }
    }
    return { status: "valid", reason: "Regex ok, non-role, not bounced, MX present" }
  })
}

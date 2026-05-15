/**
 * Bulk email checker — parallel sibling to lib/admin/url-check.ts.
 *
 * Uses Hunter.io (`HUNTER_API_KEY`) as the source of truth.  When the
 * key is missing, falls back to a local format + DNS-MX check so the
 * tool still answers sensibly without external calls.
 *
 * Verdict ladder:
 *
 *   valid       — score ≥ 80, deliverable
 *   accept_all  — domain is catch-all (deliverable but unverifiable)
 *   risky       — score 30-79 (or smtp inconclusive)
 *   webmail     — gmail / hotmail / outlook etc
 *   disposable  — Mailinator / 10minutemail / etc
 *   invalid     — undeliverable
 *   no_mx       — domain has no MX records
 *   malformed   — RFC-fail (no @, illegal chars)
 *   timeout     — Hunter / DNS timed out
 *   unknown     — Hunter said "unknown" or no provider configured
 *   error       — anything else
 */

import { promises as dns } from "node:dns"
import { isHunterAvailable, verifyEmail } from "./hunter"

export type EmailVerdict =
  | "valid" | "accept_all" | "risky"
  | "webmail" | "disposable" | "invalid"
  | "no_mx" | "malformed"
  | "timeout" | "unknown" | "error"

export interface EmailCheckResult {
  email: string
  verdict: EmailVerdict
  /** 0..100; matches Hunter's score where applicable. */
  score: number
  detail: string
  durationMs: number
  checkedAt: string
  /** Where the verdict came from. */
  source: "hunter" | "local"
  /** Hunter sub-flags when source=hunter. */
  flags?: {
    regexp: boolean
    gibberish: boolean
    disposable: boolean
    webmail: boolean
    mx_records: boolean
    smtp_check: boolean
    accept_all: boolean
    block: boolean
  }
  /** Optional ownership info attached by the bulk-from-DB path. */
  owner?: { id: string; field: string; firmId?: string | null }
}

export interface BulkOptions {
  concurrency?: number
  timeoutMs?: number
  onProgress?: (done: number, total: number, latest: EmailCheckResult) => void
}

const RFC_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function checkEmail(
  emailRaw: string,
  opts: { timeoutMs?: number } = {},
): Promise<EmailCheckResult> {
  const startedAt = Date.now()
  const checkedAt = new Date().toISOString()
  const email = (emailRaw ?? "").trim().toLowerCase()
  if (!email || !RFC_RE.test(email)) {
    return {
      email: emailRaw,
      verdict: "malformed",
      score: 0,
      detail: "RFC format check failed",
      durationMs: Date.now() - startedAt,
      checkedAt,
      source: "local",
    }
  }

  // Prefer Hunter when configured
  if (isHunterAvailable()) {
    const v = await verifyEmail(email, { timeoutMs: opts.timeoutMs })
    let verdict: EmailVerdict = "unknown"
    if (v.flags.disposable) verdict = "disposable"
    else if (!v.flags.mx_records) verdict = "no_mx"
    else if (v.result === "deliverable" && v.score >= 80) verdict = "valid"
    else if (v.flags.accept_all) verdict = "accept_all"
    else if (v.flags.webmail && v.result !== "undeliverable") verdict = "webmail"
    else if (v.result === "undeliverable") verdict = "invalid"
    else if (v.result === "risky") verdict = "risky"
    else if (v.result === "deliverable") verdict = v.score >= 50 ? "risky" : "unknown"
    else if (v.result === "unknown") verdict = "unknown"
    else if (!v.ok) verdict = v.detail.includes("timeout") ? "timeout" : "error"

    return {
      email,
      verdict,
      score: v.score,
      detail: v.detail,
      durationMs: Date.now() - startedAt,
      checkedAt,
      source: "hunter",
      flags: {
        regexp: v.flags.regexp,
        gibberish: v.flags.gibberish,
        disposable: v.flags.disposable,
        webmail: v.flags.webmail,
        mx_records: v.flags.mx_records,
        smtp_check: v.flags.smtp_check,
        accept_all: v.flags.accept_all,
        block: v.flags.block,
      },
    }
  }

  // Fallback: format + MX
  const domain = email.split("@")[1]
  if (!domain) {
    return { email, verdict: "malformed", score: 0, detail: "no domain", durationMs: Date.now() - startedAt, checkedAt, source: "local" }
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { email, verdict: "disposable", score: 0, detail: "known disposable provider", durationMs: Date.now() - startedAt, checkedAt, source: "local" }
  }
  if (WEBMAIL_DOMAINS.has(domain)) {
    return { email, verdict: "webmail", score: 50, detail: "consumer mailbox provider", durationMs: Date.now() - startedAt, checkedAt, source: "local" }
  }
  let mxOk = false
  try {
    const records = await dns.resolveMx(domain)
    mxOk = records && records.length > 0
  } catch {
    return { email, verdict: "no_mx", score: 0, detail: "no MX records", durationMs: Date.now() - startedAt, checkedAt, source: "local" }
  }
  return {
    email,
    verdict: mxOk ? "unknown" : "no_mx",
    score: mxOk ? 50 : 0,
    detail: mxOk
      ? "format ok, MX present (deliverability not verified — set HUNTER_API_KEY for SMTP-grade verification)"
      : "no MX records",
    durationMs: Date.now() - startedAt,
    checkedAt,
    source: "local",
  }
}

export async function bulkCheck(
  emails: string[],
  opts: BulkOptions = {},
): Promise<EmailCheckResult[]> {
  const concurrency = Math.max(1, Math.min(8, opts.concurrency ?? 4))
  const out: EmailCheckResult[] = new Array(emails.length)
  let cursor = 0
  let done = 0
  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= emails.length) return
      const r = await checkEmail(emails[i], { timeoutMs: opts.timeoutMs })
      out[i] = r
      done++
      opts.onProgress?.(done, emails.length, r)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, emails.length || 1) }, worker))
  return out
}

export function summarizeVerdicts(rows: EmailCheckResult[]): Record<EmailVerdict, number> {
  const init: Record<EmailVerdict, number> = {
    valid: 0, accept_all: 0, risky: 0,
    webmail: 0, disposable: 0, invalid: 0,
    no_mx: 0, malformed: 0,
    timeout: 0, unknown: 0, error: 0,
  }
  for (const r of rows) init[r.verdict]++
  return init
}

// ─── small offline catalogues ──────────────────────────────────────────
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com",
  "throwaway.email", "yopmail.com", "trashmail.com", "getnada.com",
  "fakemailgenerator.com", "maildrop.cc", "sharklasers.com",
])
const WEBMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "aol.com",
  "proton.me", "protonmail.com", "gmx.com", "gmx.de", "mail.ru",
  "qq.com", "163.com", "yandex.com",
])

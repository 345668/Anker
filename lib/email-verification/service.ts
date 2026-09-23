/**
 * Email verification service (docs/architecture/13).
 *
 *   cached (not expired)  →  stage 1 local  →  stage 2 provider (budgeted)  →  email_verifications
 *
 * Addresses are verified once and shared by every surface (matching, Discover,
 * CRM, campaigns). Only a provider-confirmed mailbox becomes "valid".
 */
import { sql } from "@/lib/db"
import { localCheck, defaultMxResolver, type MxResolver } from "./local"
import { configuredProvider, dailyLimit } from "./providers"
import { normEmail, type Verification, type VerificationStatus } from "./types"

const DAY = 86_400_000
/** Cache lifetime by outcome: confirmed results last longer than inconclusive ones. */
function expiresAt(status: VerificationStatus, reason: string | null, provider: string, now: number): Date {
  if (reason === "syntax") return new Date(now + 365 * DAY)
  if (status === "valid") return new Date(now + 90 * DAY)
  if (status === "invalid") return new Date(now + (provider === "local" ? 30 : 180) * DAY)
  if (status === "risky") return new Date(now + 60 * DAY)
  return new Date(now + 30 * DAY)
}

function rowToVerification(r: any): Verification {
  return {
    email: r.email, status: r.status, reason: r.reason ?? null, provider: r.provider,
    mxFound: r.mx_found ?? null, checkedAt: new Date(r.checked_at).toISOString(),
  }
}

/** Cached results only — no checks run. For display (Discover, lists). */
export async function cachedVerifications(emails: (string | null | undefined)[]): Promise<Map<string, Verification>> {
  const list = [...new Set(emails.map(normEmail).filter((e): e is string => !!e))]
  const out = new Map<string, Verification>()
  for (let i = 0; i < list.length; i += 1000) {
    const rows = await sql`SELECT * FROM email_verifications WHERE email = ANY(${list.slice(i, i + 1000)}) AND expires_at > now()`
    for (const r of rows) out.set(r.email, rowToVerification(r))
  }
  return out
}

async function save(v: Verification, domain: string, raw: Record<string, unknown> | null, now: number) {
  await sql`
    INSERT INTO email_verifications (email, domain, status, reason, provider, mx_found, checked_at, expires_at, raw)
    VALUES (${v.email}, ${domain}, ${v.status}, ${v.reason}, ${v.provider}, ${v.mxFound}, ${new Date(now).toISOString()}::timestamptz,
            ${expiresAt(v.status, v.reason, v.provider, now).toISOString()}::timestamptz, ${raw ? JSON.stringify(raw) : null}::jsonb)
    ON CONFLICT (email) DO UPDATE SET
      domain = EXCLUDED.domain, status = EXCLUDED.status, reason = EXCLUDED.reason, provider = EXCLUDED.provider,
      mx_found = EXCLUDED.mx_found, checked_at = EXCLUDED.checked_at, expires_at = EXCLUDED.expires_at, raw = EXCLUDED.raw`
}

/** Provider checks already spent today, across all server instances. */
export async function providerChecksToday(): Promise<number> {
  const [r] = await sql`SELECT count(*)::int AS n FROM email_verifications WHERE provider IN ('zerobounce', 'neverbounce') AND checked_at >= date_trunc('day', now())`
  return Number(r?.n ?? 0)
}

export interface VerifyOptions {
  /** Allow stage 2 (paid). Default true — it still needs a configured key and budget. */
  useProvider?: boolean
  /** At most this many provider checks in this call (on top of the daily cap). */
  providerLimit?: number
  mx?: MxResolver
  fetchImpl?: typeof fetch
}

export interface VerifyReport {
  results: Map<string, Verification>
  cached: number
  local: number
  provider: number
  providerErrors: number
  providerConfigured: boolean
  budgetLeft: number
}

/**
 * Verify addresses: cached first, then local checks for the rest, then the
 * provider for mailboxes the local stage could not settle — within the daily
 * budget. Provider failures fall back to the local result; they never fail
 * the call.
 */
export async function verifyEmails(emails: (string | null | undefined)[], opts: VerifyOptions = {}): Promise<VerifyReport> {
  const list = [...new Set(emails.map(normEmail).filter((e): e is string => !!e))].slice(0, 5000)
  const now = Date.now()
  const results = await cachedVerifications(list)
  const cached = results.size

  // Stage 1 for addresses without a live cache entry.
  const missing = list.filter((e) => !results.has(e))
  let local = 0
  if (missing.length) {
    const bouncedRows = await sql`
      SELECT DISTINCT lower(trim(email_to)) AS email FROM outreach_messages
       WHERE bounced_at IS NOT NULL AND lower(trim(email_to)) = ANY(${missing})`
    const ctx = {
      bounced: new Set<string>(bouncedRows.map((r: any) => r.email)),
      // Suppressions are one sender's choice, not a fact about the mailbox;
      // they exclude investors per workspace (matching) instead of here.
      suppressed: new Set<string>(),
      mx: opts.mx ?? defaultMxResolver,
      mxCache: new Map<string, Promise<boolean>>(),
    }
    const CONC = 20
    for (let i = 0; i < missing.length; i += CONC) {
      await Promise.all(missing.slice(i, i + CONC).map(async (email) => {
        const r = await localCheck(email, ctx)
        const v: Verification = { email, status: r.status, reason: r.reason, provider: "local", mxFound: r.mxFound, checkedAt: new Date(now).toISOString() }
        await save(v, r.domain, null, now)
        results.set(email, v)
        local++
      }))
    }
  }

  // Stage 2 for mailboxes the local stage left unconfirmed.
  const configured = await configuredProvider()
  let provider = 0, providerErrors = 0, budgetLeft = 0
  if (configured && opts.useProvider !== false) {
    budgetLeft = Math.max(0, dailyLimit() - (await providerChecksToday()))
    const cap = Math.min(budgetLeft, opts.providerLimit ?? Infinity)
    const candidates = list.filter((e) => {
      const v = results.get(e)
      return v && v.provider === "local" && v.status === "unknown"
    }).slice(0, cap)
    const CONC = 4
    for (let i = 0; i < candidates.length; i += CONC) {
      await Promise.all(candidates.slice(i, i + CONC).map(async (email) => {
        try {
          const r = await configured.provider.verify(email, configured.key, opts.fetchImpl)
          const v: Verification = { email, status: r.status, reason: r.reason, provider: configured.provider.id, mxFound: r.mxFound, checkedAt: new Date(now).toISOString() }
          await save(v, email.split("@")[1] ?? "", r.raw, now)
          results.set(email, v)
          provider++
        } catch (e: any) {
          providerErrors++
          console.warn(`[email-verification/${configured.provider.id}] ${e?.message ?? e}`)
        }
      }))
    }
    budgetLeft = Math.max(0, budgetLeft - provider)
  }

  return { results, cached, local, provider, providerErrors, providerConfigured: !!configured, budgetLeft }
}

/** Record a hard bounce or complaint from sending — the mailbox is invalid for everyone. */
export async function markBounced(email: string, reason: "bounced" | "complained" = "bounced") {
  const e = normEmail(email)
  if (!e) return
  const now = Date.now()
  await save({ email: e, status: "invalid", reason, provider: "bounce", mxFound: null, checkedAt: new Date(now).toISOString() }, e.split("@")[1] ?? "", null, now)
}

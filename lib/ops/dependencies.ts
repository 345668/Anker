/**
 * Dependency check (docs/architecture/37 §5.4, 38 §3.1).
 *
 * "Is it configured?" was answered by finding out the hard way: billing could not work because one environment variable
 * was absent, replies were never detected because no mailbox was connected, and `web_search` pointed at a service no
 * deployment could reach. None of those threw an error. This runs from the PRODUCTION runtime, names each dependency a
 * feature needs, and says plainly which are missing and what to do. It reports configuration and recent behaviour, never
 * a secret value.
 *
 * Statuses: `ok`, `degraded` (works, with a named problem), `down` (a feature that should work cannot), `unconfigured`
 * (an optional integration that is off).
 */
import { sql } from "@/lib/db"

export type DepStatus = "ok" | "degraded" | "down" | "unconfigured"
export interface DepCheck { name: string; status: DepStatus; detail: string; fix?: string }
export interface DepReport { ok: boolean; checkedAt: string; checks: DepCheck[] }

/** How old a job's latest run may be before it is stale (about two intervals), in minutes. Covers every job in `vercel.json`. */
export const CRON_MAX_AGE_MIN: Record<string, number> = {
  "promote-scheduled-articles": 150, "outreach-scheduler": 25, "outreach-poll": 25, "outreach-deliverability": 150,
  "outreach-reengage": 2880, "market-signals": 2880, "compliance-digest": 20160, "campaign-assessment": 40, "intake-assessment": 40,
  "campaign-send": 70, "deadline-reminders": 2880, "verify-emails": 2880, "directory-normalize": 2880,
  "investor-activity": 2880, "assistant-uploads-sweep": 150, "fit-ranker": 90000, "dependency-check": 2880,
}

type Env = Record<string, string | undefined>
const has = (env: Env, k: string) => !!env[k]?.trim()

async function one<T>(run: () => Promise<T[]>): Promise<T | null> {
  try { return (await run())[0] ?? null } catch { return null }
}

/** Pure part: what the environment says. */
export function envChecks(env: Env = process.env): DepCheck[] {
  const out: DepCheck[] = []
  const stripeKey = has(env, "STRIPE_SECRET_KEY"), hook = has(env, "STRIPE_WEBHOOK_SECRET")
  out.push(!stripeKey
    ? { name: "Stripe billing", status: "unconfigured", detail: "No Stripe key set." }
    : hook
      ? { name: "Stripe billing", status: "ok", detail: "Key and webhook secret are set." }
      : { name: "Stripe billing", status: "down", detail: "A Stripe key is set but STRIPE_WEBHOOK_SECRET is not, so subscription events cannot be verified and no subscription can ever sync.", fix: "Create the webhook endpoint in Stripe, copy its signing secret into STRIPE_WEBHOOK_SECRET in Vercel, redeploy." })
  out.push(has(env, "RESEND_API_KEY")
    ? { name: "Outbound email", status: "ok", detail: "RESEND_API_KEY is set." }
    : { name: "Outbound email", status: "down", detail: "No RESEND_API_KEY: no email can be sent.", fix: "Set RESEND_API_KEY." })
  out.push(has(env, "OUTREACH_FOOTER_ADDRESS")
    ? { name: "Outreach footer address", status: "ok", detail: "A postal/legal address is set for the unsubscribe footer." }
    : { name: "Outreach footer address", status: "degraded", detail: "OUTREACH_FOOTER_ADDRESS is not set; outreach carries an unsubscribe link but no sender address.", fix: "Set OUTREACH_FOOTER_ADDRESS to the legal entity name and address." })
  out.push(has(env, "UNSUBSCRIBE_SECRET") || has(env, "SECRET_KEY")
    ? { name: "Unsubscribe links", status: "ok", detail: "A signing secret is set." }
    : { name: "Unsubscribe links", status: "down", detail: "Neither UNSUBSCRIBE_SECRET nor SECRET_KEY is set, so unsubscribe links cannot be signed.", fix: "Set SECRET_KEY." })
  out.push(has(env, "BLOB_READ_WRITE_TOKEN")
    ? { name: "File storage", status: "ok", detail: "Blob token is set." }
    : { name: "File storage", status: "down", detail: "No BLOB_READ_WRITE_TOKEN: attachments and deck uploads cannot work.", fix: "Connect Vercel Blob to the project." })
  out.push(has(env, "CRON_SECRET")
    ? { name: "Cron secret", status: "ok", detail: "Set." }
    : { name: "Cron secret", status: "down", detail: "CRON_SECRET is not set: every scheduled job rejects the platform's call.", fix: "Set CRON_SECRET." })
  out.push(has(env, "PORTAL_SERVICE_TOKEN")
    ? { name: "SAIL service token", status: "ok", detail: "Set." }
    : { name: "SAIL service token", status: "unconfigured", detail: "PORTAL_SERVICE_TOKEN is not set; the SAIL relay cannot reach admin routes." })
  const imap = has(env, "IMAP_HOST") && has(env, "IMAP_USER") && has(env, "IMAP_PASS")
  out.push({ name: "Reply mailbox (IMAP)", status: imap ? "ok" : "unconfigured", detail: imap ? "IMAP credentials are set." : "No IMAP credentials (a connected Gmail account also works; see Reply detection)." })
  for (const [name, vars] of [["DocuSign", ["DOCUSIGN_ACCESS_TOKEN", "DOCUSIGN_ACCOUNT_ID"]], ["Twenty CRM", ["TWENTY_API_KEY", "TWENTY_BASE_URL"]]] as const) {
    const on = vars.every((v) => has(env, v))
    out.push({ name, status: on ? "ok" : "unconfigured", detail: on ? "Configured." : "Not configured (optional)." })
  }
  return out
}

/** Reads the database: reachability, reply detection, AI health, cron freshness. */
export async function dbChecks(now = Date.now(), env: Env = process.env): Promise<DepCheck[]> {
  const out: DepCheck[] = []
  const up = await one(() => sql`SELECT 1 AS ok` as unknown as Promise<any[]>)
  out.push(up ? { name: "Database", status: "ok", detail: "Reachable." } : { name: "Database", status: "down", detail: "The database did not answer." })
  if (!up) return out

  const mailbox = await one(() => sql`SELECT count(*)::int AS n FROM email_oauth_accounts` as unknown as Promise<any[]>)
  const imap = has(env, "IMAP_HOST") && has(env, "IMAP_USER") && has(env, "IMAP_PASS")
  const sent = await one(() => sql`SELECT count(*)::int AS n FROM outreach_messages WHERE status = 'sent'` as unknown as Promise<any[]>)
  const replies = await one(() => sql`SELECT count(*)::int AS n FROM outreach_replies` as unknown as Promise<any[]>)
  const connected = imap || Number(mailbox?.n ?? 0) > 0
  out.push(connected
    ? { name: "Reply detection", status: "ok", detail: `A mailbox is connected; ${Number(replies?.n ?? 0)} replies recorded from ${Number(sent?.n ?? 0)} sent.` }
    : Number(sent?.n ?? 0) > 0
      ? { name: "Reply detection", status: "down", detail: `No mailbox is connected, so replies cannot be seen: ${Number(replies?.n ?? 0)} replies recorded from ${Number(sent?.n ?? 0)} sent. Classification and follow-up have nothing to work on.`, fix: "Connect a Gmail account in Settings, or set IMAP_HOST, IMAP_USER and IMAP_PASS." }
      : { name: "Reply detection", status: "unconfigured", detail: "No mailbox connected (nothing sent yet)." })

  const ai = await one(() => sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE ok)::int AS ok FROM ai_calls WHERE created_at > now() - interval '24 hours' AND provider NOT IN ('disabled','rejected')` as unknown as Promise<any[]>)
  const n = Number(ai?.n ?? 0), good = Number(ai?.ok ?? 0)
  out.push(n === 0
    ? { name: "AI calls (24 h)", status: "unconfigured", detail: "No AI calls in the last 24 hours." }
    : good === 0
      ? { name: "AI calls (24 h)", status: "down", detail: `${n} calls, none succeeded.`, fix: "Check the provider keys and lane quotas in SAIL, AI config." }
      : good / n < 0.9
        ? { name: "AI calls (24 h)", status: "degraded", detail: `${good} of ${n} succeeded (${Math.round((100 * good) / n)}%).` }
        : { name: "AI calls (24 h)", status: "ok", detail: `${good} of ${n} succeeded (${Math.round((100 * good) / n)}%).` })

  let latest: any[] = []
  try { latest = (await sql`SELECT DISTINCT ON (job) job, started_at, status FROM cron_runs ORDER BY job, started_at DESC`) as any[] } catch { /* table not yet there */ }
  const byJob = new Map(latest.map((r) => [String(r.job), r]))
  const stale: string[] = [], never: string[] = [], failed: string[] = []
  for (const [job, maxMin] of Object.entries(CRON_MAX_AGE_MIN)) {
    const r = byJob.get(job)
    if (!r) { never.push(job); continue }
    const ageMin = (now - new Date(r.started_at).getTime()) / 60000
    if (r.status === "failed") failed.push(job)
    else if (r.status === "running" && ageMin > 15) stale.push(`${job} (running ${Math.round(ageMin)} min: likely killed)`)
    else if (ageMin > maxMin) stale.push(`${job} (last ${Math.round(ageMin)} min ago)`)
  }
  out.push(failed.length || stale.length
    ? { name: "Scheduled jobs", status: "degraded", detail: [failed.length ? `last run failed: ${failed.join(", ")}` : "", stale.length ? `stale: ${stale.join(", ")}` : ""].filter(Boolean).join("; ") }
    : never.length === Object.keys(CRON_MAX_AGE_MIN).length
      ? { name: "Scheduled jobs", status: "unconfigured", detail: "No run recorded yet (tracking started with this release)." }
      : { name: "Scheduled jobs", status: "ok", detail: `${byJob.size} jobs have reported${never.length ? `; not yet seen: ${never.join(", ")}` : ""}.` })
  return out
}

export async function runDependencyChecks(opts: { now?: number; env?: Env } = {}): Promise<DepReport> {
  const env = opts.env ?? process.env, now = opts.now ?? Date.now()
  const checks = [...envChecks(env), ...(await dbChecks(now, env))]
  return { ok: !checks.some((c) => c.status === "down"), checkedAt: new Date(now).toISOString(), checks }
}

import { sql } from "@/lib/db"
import { getEffective } from "@/lib/entitlements"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { costOf, DEFAULT_RATES, NoRateError, type Rate } from "./credit-cost"
export { DEFAULT_RATES, RECIPE_CREDITS, type Rate } from "./credit-cost"

/**
 * Credits for the Media Studio (docs/architecture/52). A credit is about $0.001 of provider cost. A workspace has a daily allowance
 * (plan, override or this default), shared by its members, that resets at 00:00 UTC, plus bonus credits an operator granted in SAIL.
 * The ledger is append-only and the balance is always derived from it.
 */
export const DEFAULT_DAILY_CREDITS = 1000
/** A limit value of -1 means unlimited (the internal plan, or an operator's decision). */
export const UNLIMITED = -1
let rateCache: { at: number; rates: Record<string, Rate> } | null = null
/** The rates in force: the table's active rows over the defaults, read at most once a minute. */
export async function loadRates(): Promise<Record<string, Rate>> {
  if (rateCache && Date.now() - rateCache.at < 60_000) return rateCache.rates
  const rates = { ...DEFAULT_RATES }
  try {
    const rows =
      (await sql`SELECT model, resolution, unit, credits, active FROM ai_studio_credit_rates`) as any[]
    for (const r of rows) {
      const key = `${r.model}|${r.resolution}`
      if (r.active) rates[key] = { unit: r.unit, credits: Number(r.credits) }
      else delete rates[key]
    }
  } catch {}
  rateCache = { at: Date.now(), rates }
  return rates
}
export const _resetRateCache = () => {
  rateCache = null
}

/** What one request costs, or a refusal (a model with no price is never charged zero). */
export function priceOf(input: { model: string; resolution: string; duration?: number }, rates: Record<string, Rate>): number {
  try {
    return costOf(input, rates)
  } catch (e) {
    if (e instanceof NoRateError) throw new WorkspaceError("This model has no credit price yet. Contact support.", 503)
    throw e
  }
}

/** The daily allowance for a workspace, or null for unlimited. A personal scope (no workspace) gets the platform default. */
export async function allowanceFor(orgId: string | null): Promise<number | null> {
  if (!orgId) return DEFAULT_DAILY_CREDITS
  const v = (await getEffective(orgId)).limits.ai_studio_daily_credits
  if (typeof v !== "number") return DEFAULT_DAILY_CREDITS
  return v < 0 ? null : Math.floor(v)
}

export interface CreditsView {
  /** Daily allowance, null when unlimited. */
  allowance: number | null
  usedToday: number
  bonus: number
  /** Allowance left today plus bonus, null when unlimited. */
  remaining: number | null
  unlimited: boolean
  resetsAt: string
}

export const nextResetUtc = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()

export async function creditsView(scopeKey: string, allowance: number | null): Promise<CreditsView> {
  const [u] =
    (await sql`SELECT COALESCE(-sum(credits), 0)::int AS n FROM ai_studio_credit_ledger WHERE scope_key = ${scopeKey} AND source = 'daily' AND day = (now() AT TIME ZONE 'UTC')::date`) as any[]
  const [b] =
    (await sql`SELECT GREATEST(0, COALESCE(sum(credits), 0))::int AS n FROM ai_studio_credit_ledger WHERE scope_key = ${scopeKey} AND source = 'bonus'`) as any[]
  const used = Number(u?.n ?? 0),
    bonus = Number(b?.n ?? 0)
  return {
    allowance,
    usedToday: used,
    bonus,
    remaining: allowance === null ? null : Math.max(0, allowance - used) + bonus,
    unlimited: allowance === null,
    resetsAt: nextResetUtc(),
  }
}

export function shortMessage(cost: number, have: number): string {
  return `This needs ${cost} credits and ${have} are left today. Credits reset at 00:00 UTC. Ask your administrator for more, or choose a smaller option.`
}

/**
 * Returns the credits of jobs that ended without producing anything (failed, blocked, canceled), once each: a unique key on the job and
 * the source makes a repeat harmless. An uncertain job stays charged until it settles. Pass a job id for one job, or nothing to sweep all.
 */
export async function refundFailed(jobId?: string): Promise<number> {
  const rows = (
    jobId
      ? await sql`INSERT INTO ai_studio_credit_ledger (scope_key, org_id, user_id, job_id, kind, credits, source, day, reason)
        SELECT s.scope_key, s.org_id, s.user_id, s.job_id, 'refund', -s.credits, s.source, s.day, 'The generation did not complete'
          FROM ai_studio_credit_ledger s JOIN ai_studio_jobs j ON j.id = s.job_id
         WHERE s.job_id = ${jobId} AND s.kind = 'spend' AND j.status IN ('failed', 'blocked', 'canceled')
        ON CONFLICT (job_id, source) WHERE kind = 'refund' DO NOTHING RETURNING id`
      : await sql`INSERT INTO ai_studio_credit_ledger (scope_key, org_id, user_id, job_id, kind, credits, source, day, reason)
        SELECT s.scope_key, s.org_id, s.user_id, s.job_id, 'refund', -s.credits, s.source, s.day, 'The generation did not complete'
          FROM ai_studio_credit_ledger s JOIN ai_studio_jobs j ON j.id = s.job_id
         WHERE s.kind = 'spend' AND j.status IN ('failed', 'blocked', 'canceled')
        ON CONFLICT (job_id, source) WHERE kind = 'refund' DO NOTHING RETURNING id`
  ) as any[]
  return rows.length
}

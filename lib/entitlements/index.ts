/**
 * Entitlements: the one place Anker asks "may this workspace do this?". docs/architecture/41.
 *
 * Open by default (no plan and no override means everything is allowed), cached for 30 seconds per process, and fail open on a lookup
 * error so a database blip cannot lock customers out. A paused or offboarding workspace is refused because an operator decided it.
 */
import "server-only"
import { sql } from "@/lib/db"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import {
  EntitlementError, refusal, resolveEffective, flagOn,
  type Action, type Effective, type FeatureKey, type LimitKey, type LifecycleState, type Overrides, type PlanRow,
} from "./model"
export * from "./model"

const TTL_MS = 30_000
const cache = new Map<string, { at: number; value: Effective }>()
let flagCache: { at: number; rows: Map<string, { enabled: boolean; rollout_pct: number }> } | null = null

const obj = (v: unknown): any => (typeof v === "string" ? (() => { try { return JSON.parse(v) } catch { return {} } })() : v ?? {})

async function loadFlags(): Promise<Map<string, { enabled: boolean; rollout_pct: number }>> {
  if (flagCache && Date.now() - flagCache.at < TTL_MS) return flagCache.rows
  const rows = (await sql`SELECT key, enabled, rollout_pct FROM platform_flags`) as any[]
  flagCache = { at: Date.now(), rows: new Map(rows.map((r) => [String(r.key), { enabled: !!r.enabled, rollout_pct: Number(r.rollout_pct) }])) }
  return flagCache.rows
}

export async function isFlagOn(flag: string, orgId: string): Promise<boolean> {
  try { return flagOn((await loadFlags()).get(flag), flag, orgId) } catch { return false }
}

export async function getEffective(orgId: string): Promise<Effective> {
  const hit = cache.get(orgId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  try {
    const ent = ((await sql`SELECT plan, features, limits FROM tenant_entitlements WHERE org_id = ${orgId}`) as any[])[0]
    const plan = ent?.plan ? ((await sql`SELECT plan, label, features, limits FROM plan_catalog WHERE plan = ${ent.plan}`) as any[])[0] : null
    const life = ((await sql`SELECT state, reason FROM tenant_lifecycle WHERE org_id = ${orgId}`) as any[])[0]
    const flags = await loadFlags()
    const value = resolveEffective({
      plan: plan ? ({ plan: plan.plan, label: plan.label, features: obj(plan.features), limits: obj(plan.limits) } as PlanRow) : null,
      overrides: ent ? ({ plan: ent.plan ?? null, features: obj(ent.features), limits: obj(ent.limits) } as Overrides) : null,
      lifecycle: life ? { state: life.state as LifecycleState, reason: life.reason } : null,
      maintenance: flags.get("maintenance")?.enabled === true,
    })
    cache.set(orgId, { at: Date.now(), value })
    return value
  } catch (e) {
    console.warn("[entitlements] lookup failed, allowing:", (e as Error).message)
    return resolveEffective({ plan: null, overrides: null, lifecycle: null })
  }
}

/** Forget what was cached (after SAIL changes something in the same process, and in tests). */
export function clearEntitlementCache(): void { cache.clear(); flagCache = null }

export async function can(orgId: string, feature: FeatureKey): Promise<boolean> { return (await getEffective(orgId)).features[feature] }
export async function limitOf(orgId: string, key: LimitKey): Promise<number | null> { return (await getEffective(orgId)).limits[key] }

/** What a refusal looks like to the routes: a WorkspaceError (they already answer those) carrying our code. 402 for a used-up allowance, 503 for maintenance. */
export class EntitlementRefusal extends WorkspaceError {
  constructor(readonly code: EntitlementError["code"], message: string) { super(message, code === "limit" ? 402 : code === "maintenance" ? 503 : 403) }
}
const toRefusal = (r: EntitlementError) => new EntitlementRefusal(r.code, r.message)

/** Throws an EntitlementRefusal when the workspace may not do this; returns the effective entitlements otherwise. */
export async function assertAllowed(orgId: string, action: Action, feature?: FeatureKey): Promise<Effective> {
  const e = await getEffective(orgId)
  const r = refusal(e, action, feature)
  if (r) throw toRefusal(r)
  return e
}

/** What the workspace has used this month, for the limits that can be measured today. */
export async function usageThisMonth(orgId: string): Promise<{ aiSpendUsd: number; intakeSubmissions: number }> {
  const ai = ((await sql`SELECT COALESCE(sum(cost_usd), 0)::float AS s FROM ai_calls WHERE workspace_id = ${orgId} AND created_at >= date_trunc('month', now())`) as any[])[0]
  let intake = 0
  try {
    intake = Number(((await sql`SELECT count(*)::int AS n FROM intake_submissions s JOIN organizations o ON o.fund_id = s.fund_id WHERE o.id = ${orgId} AND s.created_at >= date_trunc('month', now())`) as any[])[0].n)
  } catch { /* table absent */ }
  return { aiSpendUsd: Number(ai?.s ?? 0), intakeSubmissions: intake }
}

/** Refuse when a measured monthly limit is already used up. A null limit is unlimited. */
export async function assertWithinLimit(orgId: string, key: "ai_spend_usd_month" | "intake_submissions_month"): Promise<void> {
  const limit = await limitOf(orgId, key)
  if (limit === null) return
  const u = await usageThisMonth(orgId)
  const used = key === "ai_spend_usd_month" ? u.aiSpendUsd : u.intakeSubmissions
  if (used >= limit) throw toRefusal(new EntitlementError("limit", key === "ai_spend_usd_month" ? "Your plan's AI allowance for this month is used up. It resets next month, or contact support to raise it." : "Your plan's allowance of applications for this month is used up."))
}

export { EntitlementError }

/**
 * May this person send outreach? A sender can belong to several workspaces; they may send if ANY of their workspaces allows it
 * (not paused, outreach on, under the daily limit). Platform senders and people with no workspace are not restricted here.
 */
export async function assertSenderMayContact(userId: string | null | undefined): Promise<void> {
  if (!userId || userId.startsWith("platform:")) return
  try {
    const orgs = ((await sql`SELECT DISTINCT org_id FROM memberships WHERE user_id = ${userId}`) as any[]).map((r) => String(r.org_id))
    if (!orgs.length) return
    let first: EntitlementRefusal | null = null
    for (const org of orgs) {
      try {
        const e = await assertAllowed(org, "send", "outreach")
        const cap = e.limits.outreach_sends_day
        if (cap !== null) {
          const n = Number(((await sql`SELECT count(*)::int AS n FROM outreach_messages WHERE sent_at >= date_trunc('day', now()) AND user_id IN (SELECT user_id FROM memberships WHERE org_id = ${org})`) as any[])[0].n)
          if (n >= cap) throw new EntitlementRefusal("limit", "Today's sending allowance for your plan is used up. It resets tomorrow, or contact support to raise it.")
        }
        return
      } catch (err) { if (err instanceof EntitlementRefusal) first ??= err; else throw err }
    }
    if (first) throw first
  } catch (err) {
    if (err instanceof EntitlementRefusal) throw err
    console.warn("[entitlements] sender check failed, allowing:", (err as Error).message)
  }
}

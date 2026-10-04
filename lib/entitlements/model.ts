/**
 * Entitlements, pure (no database): the resolver and the rules. docs/architecture/41.
 * The catalogue itself lives in the `plan_catalog` table so SAIL can edit it; the keys below are the universe the code knows.
 */
export const FEATURE_KEYS = ["assistant", "outreach", "linkedin", "matchmaking", "intake", "tools", "fund_ops", "spvs", "deals"] as const
export const LIMIT_KEYS = ["ai_spend_usd_month", "seats", "outreach_sends_day", "intake_submissions_month", "storage_mb"] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]
export type LimitKey = (typeof LIMIT_KEYS)[number]
export type LifecycleState = "trial" | "active" | "paused" | "offboarding"
export const LIFECYCLE_STATES: LifecycleState[] = ["trial", "active", "paused", "offboarding"]

/** What a workspace in this state may do. Reading and signing in are always allowed. */
export type Action = "ai" | "send" | "intake" | "convert"
export const BLOCKED_WHEN_PAUSED: Action[] = ["ai", "send", "intake", "convert"]

export interface PlanRow { plan: string; label?: string; features: Partial<Record<FeatureKey, boolean>>; limits: Partial<Record<LimitKey, number | null>> }
export interface Overrides { plan: string | null; features: Partial<Record<FeatureKey, boolean>>; limits: Partial<Record<LimitKey, number | null>> }

export interface Effective {
  plan: string | null
  /** True when no plan and no override exist: everything is allowed, nothing is limited. */
  open: boolean
  features: Record<FeatureKey, boolean>
  limits: Record<LimitKey, number | null>
  state: LifecycleState
  stateReason: string | null
  maintenance: boolean
}

/** Plan defaults, then the workspace's overrides. No plan means open; an override alone still applies. */
export function resolveEffective(input: { plan: PlanRow | null; overrides: Overrides | null; lifecycle: { state: LifecycleState; reason?: string | null } | null; maintenance?: boolean }): Effective {
  const o = input.overrides
  const open = !input.plan && !o
  const features = {} as Record<FeatureKey, boolean>
  for (const k of FEATURE_KEYS) {
    const ov = o?.features?.[k]
    features[k] = typeof ov === "boolean" ? ov : input.plan ? input.plan.features[k] === true : true
  }
  const limits = {} as Record<LimitKey, number | null>
  for (const k of LIMIT_KEYS) {
    const ov = o?.limits ? o.limits[k] : undefined
    limits[k] = ov !== undefined ? (ov === null || Number.isFinite(Number(ov)) ? (ov === null ? null : Number(ov)) : null) : input.plan ? (typeof input.plan.limits[k] === "number" ? (input.plan.limits[k] as number) : null) : null
  }
  return { plan: o?.plan ?? input.plan?.plan ?? null, open, features, limits, state: input.lifecycle?.state ?? "active", stateReason: input.lifecycle?.reason ?? null, maintenance: !!input.maintenance }
}

/** A stable 0-99 bucket for a workspace and a flag, so a rollout does not flip a workspace in and out between requests. */
export function bucketOf(flag: string, orgId: string): number {
  let h = 2166136261
  for (const c of `${flag}:${orgId}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return h % 100
}
export const flagOn = (f: { enabled: boolean; rollout_pct: number } | undefined | null, flag: string, orgId: string): boolean =>
  !!f && f.enabled && bucketOf(flag, orgId) < f.rollout_pct

/** Which transitions an operator may make, and what each needs. Purge is not a transition: it is the erasure workflow. */
const MOVES: Record<LifecycleState, LifecycleState[]> = {
  trial: ["active", "paused", "offboarding"],
  active: ["paused", "offboarding", "trial"],
  paused: ["active", "offboarding"],
  offboarding: ["active", "paused"],
}
export function canMove(from: LifecycleState, to: LifecycleState): boolean { return from !== to && MOVES[from].includes(to) }
/** Moving into offboarding is deliberate: superadmin only. Everything else needs admin. */
export function minRoleFor(to: LifecycleState): "admin" | "superadmin" { return to === "offboarding" ? "superadmin" : "admin" }

export class EntitlementError extends Error {
  constructor(readonly code: "paused" | "offboarding" | "maintenance" | "module" | "limit", message: string) { super(message); this.name = "EntitlementError" }
}

/** The plain-language reason an action is refused, or null when it is allowed. Pure. */
export function refusal(e: Effective, action: Action, feature?: FeatureKey): EntitlementError | null {
  if (e.maintenance && (action === "ai" || action === "send")) return new EntitlementError("maintenance", "Anker is in maintenance for a short while. Please try again soon.")
  if ((e.state === "paused" || e.state === "offboarding") && BLOCKED_WHEN_PAUSED.includes(action))
    return new EntitlementError(e.state === "paused" ? "paused" : "offboarding", e.state === "paused" ? "This workspace is paused, so this action is switched off. You can still sign in, read and export your data. Contact support to resume." : "This workspace is being closed, so this action is switched off. You can still sign in and export your data.")
  if (feature && !e.features[feature]) return new EntitlementError("module", "This is not part of your plan. Contact support to add it.")
  return null
}

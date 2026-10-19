/**
 * One way to run LP matchmaking (docs/architecture/63 section 4.1).
 *
 * The matchmaking page, Anker AI, agents and Telegram all come through here, so the same fund profile, options and mandate give the same ranked list wherever
 * it is asked for. The engine itself (lib/matching/v2) is unchanged; this adds what a workspace needs around it: the profile resolved inside the workspace, the
 * fund's own rules, the hard exclusions, and a saved run that every member of the workspace can see.
 */
import { sql } from "@/lib/db"
import { toFundProfile } from "@/lib/matching/fund-profile"
import { fundReadiness, runOptionsSchema } from "@/lib/matching/profile-readiness"
import { EMPTY_FILTERS, describeFilters, hasFilters, parseFilters, INVESTOR_CLASSES, type InvestorClass, type MatchFilters } from "@/lib/matching/filters"
import { runLpMatchingV2 } from "@/lib/matching/v2/engine"
import { saveSessionV2 } from "@/lib/matching/v2/persistence"
import type { FundProfileV2, MatchingResultV2 } from "@/lib/matching/v2/types"
import { loadLpRuleData } from "./rules-load"
import { buildLpRules, describeExclusions, type LpRuleData, type LpRules } from "./rules"

export type LpMatchSource = "page" | "assistant" | "telegram" | "agent"
export interface LpMatchScope { orgId: string; userId: string; source: LpMatchSource }
export interface LpMatchInput {
  /** A specific profile of the workspace; omitted = the workspace's active profile (the most recently updated). */
  fundProfileId?: string
  options?: { minScore?: number; maxFirms?: number; maxContacts?: number; enableAi?: boolean }
  /** The mandate (doc 26); anything unreadable is dropped by parseFilters. */
  mandate?: unknown
  /** Show LPs already in the CRM instead of leaving them out. */
  includeKnown?: boolean
}
export class LpMatchError extends Error {
  constructor(message: string, readonly status = 409, readonly missingFields?: unknown) { super(message); this.name = "LpMatchError" }
}
export interface LpMatchOutcome {
  result: MatchingResultV2
  fund: FundProfileV2
  filters: MatchFilters
  filterSummary: string
  exclusionSummary: string
}

export interface LpMatchDeps {
  run: typeof runLpMatchingV2
  save: typeof saveSessionV2
  loadRules: (scope: { orgId: string; userId: string }, o: { excludedJurisdictions?: string[]; includeKnown?: boolean }) => Promise<LpRuleData>
}
const defaultDeps: LpMatchDeps = { run: runLpMatchingV2, save: saveSessionV2, loadRules: loadLpRuleData }

/** The workspace's profile: the one asked for, or the active one updated most recently. Never another workspace's. */
export async function resolveFundProfile(scope: { orgId: string }, id?: string | null): Promise<any | null> {
  const rows = id
    ? await sql`SELECT * FROM fund_profiles WHERE id = ${id} AND org_id = ${scope.orgId} AND is_active = true LIMIT 1`
    : await sql`SELECT * FROM fund_profiles WHERE org_id = ${scope.orgId} AND is_active = true ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1`
  return (rows as any[])[0] ?? null
}

/** The fund's allowed LP classes narrow the mandate; a mandate that asks only for classes the fund does not allow is refused, not silently emptied. */
export function applyFundRules(mandate: MatchFilters, allowed: string[] | undefined): MatchFilters {
  const ok = (allowed ?? []).filter((c): c is InvestorClass => (INVESTOR_CLASSES as readonly string[]).includes(c))
  if (!ok.length) return mandate
  if (!mandate.classes.length) return { ...mandate, classes: ok }
  const both = mandate.classes.filter((c) => ok.includes(c))
  if (!both.length) throw new LpMatchError(`The classes you asked for are not among those your fund approaches (${ok.join(", ")}). Change the fund's rules or the mandate.`, 422)
  return { ...mandate, classes: both }
}

export async function runLpMatch(scope: LpMatchScope, input: LpMatchInput = {}, deps: LpMatchDeps = defaultDeps): Promise<LpMatchOutcome> {
  const options = runOptionsSchema.safeParse(input.options ?? {})
  if (!options.success) throw new LpMatchError("Use a score between 0 and 100 and result limits between 1 and 20,000.", 422)

  const row = await resolveFundProfile(scope, input.fundProfileId)
  if (!row) throw new LpMatchError(input.fundProfileId ? "Fund profile not found in this workspace." : "This workspace has no fund profile yet.", input.fundProfileId ? 404 : 409)
  const fund = toFundProfile(row)
  const missing = fundReadiness(fund)
  if (missing.length) throw new LpMatchError("Complete the required fund fields before matching.", 422, missing)

  const filters = applyFundRules(parseFilters(input.mandate) ?? EMPTY_FILTERS, fund.allowedLpClasses)
  const ruleData = await deps.loadRules(scope, { excludedJurisdictions: fund.excludedJurisdictions, includeKnown: input.includeKnown })
  const rules: LpRules = buildLpRules(ruleData)

  const result = await deps.run(fund, { ...options.data, filters, rules })
  await deps.save(result, scope.userId, { orgId: scope.orgId, source: scope.source, filters })
  return {
    result, fund, filters,
    filterSummary: hasFilters(filters) ? describeFilters(filters) : "",
    exclusionSummary: result.exclusions ? describeExclusions(result.exclusions) : "",
  }
}

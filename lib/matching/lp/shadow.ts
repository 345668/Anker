/**
 * Extra scoring factors that are measured before they are trusted (docs/architecture/63 section 4.3).
 *
 * Each factor reads a fact the platform already holds and gives a value from 0 to 1, or null when the fact is not known (never zero for "unknown": that would punish the
 * thin rows the directory has least on). Every match stores all of them. A factor changes the score only when it has been promoted, and then by weight x value points.
 * Pure: the facts come in, numbers go out.
 */
import type { Confidence } from "./explain"

export const SHADOW_KEYS = ["recent_activity", "emerging_manager_appetite", "relationship_proximity", "data_confidence"] as const
export type ShadowKey = (typeof SHADOW_KEYS)[number]
export type ShadowValues = Record<ShadowKey, number | null>
export interface FactorSetting { status: "shadow" | "promoted" | "retired"; weight: number }
export type FactorSettings = Record<ShadowKey, FactorSetting>

/** Promoted factors can move a score by at most this many points in all. */
export const MAX_ADJUSTMENT = 15

export interface ShadowContext {
  now: number
  /** The fund's own number (1 for a first fund). Emerging-manager appetite only matters to a first or second fund. */
  fundNumber: number | null
  priorLpFirmIds: Set<string>
  priorContactEmails: Set<string>
  /** First-degree LinkedIn connections of the team by the firm they work at (normalised name). Null when the team has imported none: then no connection means nothing. */
  connectionsByFirm: Map<string, number> | null
  /** `in/slug` of every first-degree connection, and of every person the team has a recorded mutual connection with. */
  connectionSlugs: Set<string> | null
  mutualTargets: Set<string> | null
  /** CRM entries that have answered or gone further (replied, meeting, diligence, committed). */
  warmFirmIds: Set<string>
  warmInvestorIds: Set<string>
}

export interface FirmInput { firmId: string; normalizedName: string; lastInvestmentAt: Date | string | null | undefined; text: string | null | undefined; confidence?: Confidence }
export interface PersonInput { investorId: string; email: string | null | undefined; linkedinSlug: string | null; firm: FirmInput | null; text: string | null | undefined; confidence?: Confidence }

const MONTH_MS = 30.44 * 24 * 3600 * 1000

/** How recently the firm invested: within a year is full value, then it fades. Unknown is null. */
export function recency(last: Date | string | null | undefined, now: number): number | null {
  if (!last) return null
  const t = new Date(last).getTime()
  if (!Number.isFinite(t)) return null
  const months = Math.max(0, (now - t) / MONTH_MS)
  return months <= 12 ? 1 : months <= 24 ? 0.6 : months <= 48 ? 0.25 : 0
}

const EM_PHRASES = [
  /emerging (fund )?manager/i, /first[- ]time (fund|manager|GP)/i, /new(er)? (fund )?managers?/i, /\bfund i\b/i, /\bfund (i|1|one|ii|2|two)\b.{0,40}\b(manager|gp)/i,
  /seed[- ]stage (funds?|managers?)/i, /back(s|ing)? (early|new) (fund )?managers?/i, /emerging (venture )?(capital )?managers? program/i, /spinout|spin-out.{0,30}fund/i,
]
/** Whether the text says the investor backs new or emerging managers: 0.5 for one phrase, 1 for two or more. No text is unknown. */
export function emergingAppetite(text: string | null | undefined, fundNumber: number | null): number | null {
  if (fundNumber != null && fundNumber > 2) return null          // not relevant to a later fund
  const t = (text ?? "").trim()
  if (t.length < 20) return null
  const hits = EM_PHRASES.filter((r) => r.test(t)).length
  return hits >= 2 ? 1 : hits === 1 ? 0.5 : 0
}

const CONFIDENCE_VALUE: Record<Confidence, number> = { high: 1, medium: 0.5, low: 0 }
const confidenceValue = (c: Confidence | undefined) => (c ? CONFIDENCE_VALUE[c] : null)

/** How close the team already is to this firm or person. The strongest relationship counts; the others do not add up. */
export function proximity(args: { firmId: string | null; normalizedName: string | null; investorId?: string | null; email?: string | null; slug?: string | null }, ctx: ShadowContext): number | null {
  const e = (args.email ?? "").trim().toLowerCase()
  if (args.firmId && ctx.priorLpFirmIds.has(args.firmId)) return 1                      // an LP in an earlier fund
  if (e && ctx.priorContactEmails.has(e)) return 1
  if ((args.firmId && ctx.warmFirmIds.has(args.firmId)) || (args.investorId && ctx.warmInvestorIds.has(args.investorId))) return 0.8   // someone there has already answered
  const graph = ctx.connectionsByFirm !== null || ctx.connectionSlugs !== null
  if (args.slug && ctx.connectionSlugs?.has(args.slug)) return 0.9                       // the person is a first-degree connection
  if (args.slug && ctx.mutualTargets?.has(args.slug)) return 0.6                         // the team knows someone who knows them
  const n = args.normalizedName ? ctx.connectionsByFirm?.get(args.normalizedName) ?? 0 : 0
  if (n > 0) return Math.min(0.7, 0.4 + 0.15 * (n - 1))                                  // a connection works at the firm
  return graph ? 0 : null                                                               // with no graph imported, silence is not evidence
}

export function firmShadow(f: FirmInput, ctx: ShadowContext): ShadowValues {
  return {
    recent_activity: recency(f.lastInvestmentAt, ctx.now),
    emerging_manager_appetite: emergingAppetite(f.text, ctx.fundNumber),
    relationship_proximity: proximity({ firmId: f.firmId, normalizedName: f.normalizedName }, ctx),
    data_confidence: confidenceValue(f.confidence),
  }
}

/** A person takes their firm's recent activity (the directory records it for firms) and reads their own words for appetite, falling back to the firm's. */
export function personShadow(p: PersonInput, ctx: ShadowContext): ShadowValues {
  const own = emergingAppetite(p.text, ctx.fundNumber)
  return {
    recent_activity: p.firm ? recency(p.firm.lastInvestmentAt, ctx.now) : null,
    emerging_manager_appetite: own ?? (p.firm ? emergingAppetite(p.firm.text, ctx.fundNumber) : null),
    relationship_proximity: proximity({ firmId: p.firm?.firmId ?? null, normalizedName: p.firm?.normalizedName ?? null, investorId: p.investorId, email: p.email, slug: p.linkedinSlug }, ctx),
    data_confidence: confidenceValue(p.confidence),
  }
}

export interface ShadowDetail { value: number | null; weight: number; applied: boolean }
/** What the promoted factors add to a score, and a record of every factor's value either way. */
export function adjustment(values: ShadowValues, settings: FactorSettings): { points: number; detail: Record<ShadowKey, ShadowDetail> } {
  let points = 0
  const detail = {} as Record<ShadowKey, ShadowDetail>
  for (const k of SHADOW_KEYS) {
    const s = settings[k], v = values[k]
    const applied = s.status === "promoted" && v != null
    if (applied) points += s.weight * (v as number)
    detail[k] = { value: v == null ? null : Math.round(v * 100) / 100, weight: s.weight, applied }
  }
  return { points: Math.round(Math.min(MAX_ADJUSTMENT, points) * 10) / 10, detail }
}

export const DEFAULT_SETTINGS: FactorSettings = {
  recent_activity: { status: "shadow", weight: 6 }, emerging_manager_appetite: { status: "shadow", weight: 5 },
  relationship_proximity: { status: "shadow", weight: 8 }, data_confidence: { status: "shadow", weight: 4 },
}
export const emptyShadowContext = (now = Date.now()): ShadowContext => ({
  now, fundNumber: null, priorLpFirmIds: new Set(), priorContactEmails: new Set(), connectionsByFirm: null, connectionSlugs: null, mutualTargets: null, warmFirmIds: new Set(), warmInvestorIds: new Set(),
})

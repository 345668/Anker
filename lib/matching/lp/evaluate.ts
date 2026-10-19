/**
 * Does an extra factor put the right LPs higher? (docs/architecture/63 section 8.)
 *
 * The question is answered on a workspace's own labelled LPs: each is one the fund's people said they would approach (fit) or would not (not fit). For every factor the
 * ranking by the base score is compared with the ranking by base + weight x value, by AUC (the chance that a fit is ranked above a not-fit; 0.5 is a coin). The difference
 * is given with a 95% interval from resampling the labelled LPs, because a few dozen labels move an AUC by chance: a factor is recommended for promotion only when it clears the
 * gain AND its whole interval is above zero. Nothing here promotes anything; a person does, with this report in front of them. Pure and deterministic.
 */
import { auc } from "@/lib/matching/v2/ranker-fit"
import { MAX_ADJUSTMENT, SHADOW_KEYS, type FactorSettings, type ShadowKey, type ShadowValues } from "./shadow"

export const GUARDS_LP = { minLabelled: 40, minFit: 12, minNotFit: 12, minCoverage: 0.3, minAucGain: 0.02, resamples: 1000 } as const

export interface EvalRow { key: string; label: 0 | 1; source: "founder_set" | "feedback"; base: number; values: ShadowValues }
export type Verdict = "promote" | "keep_shadow" | "retire"
export interface FactorResult { key: ShadowKey | "all"; weight: number; status: string; coverage: number; auc: number; delta: number; ciLow: number; ciHigh: number; verdict: Verdict; reason: string }
export interface EvalReport {
  n: number; fit: number; notFit: number; bySource: { founder_set: number; feedback: number }
  baselineAuc: number; factors: FactorResult[]; combined: FactorResult
  /** Why no factor can be judged yet, or null. */
  blocked: string | null
}

/** A small seeded generator, so the same labels always give the same interval. */
function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const r3 = (n: number) => Math.round(n * 1000) / 1000

function candidate(row: EvalRow, keys: ShadowKey[], weights: Record<ShadowKey, number>): number {
  let pts = 0
  for (const k of keys) { const v = row.values[k]; if (v != null) pts += weights[k] * v }
  return row.base + Math.min(MAX_ADJUSTMENT, pts)
}

function compare(rows: EvalRow[], keys: ShadowKey[], weights: Record<ShadowKey, number>) {
  const labels = rows.map((r) => r.label)
  const baseS = rows.map((r) => r.base), candS = rows.map((r) => candidate(r, keys, weights))
  const a0 = auc(baseS, labels), a1 = auc(candS, labels)
  const rand = mulberry32(rows.length * 7919 + rows.reduce((s, r, i) => s + (r.label ? i + 1 : 0), 0))
  const diffs: number[] = []
  for (let b = 0; b < GUARDS_LP.resamples; b++) {
    const idx = Array.from({ length: rows.length }, () => Math.floor(rand() * rows.length))
    const l = idx.map((i) => labels[i])
    if (!l.includes(0) || !l.includes(1)) continue
    diffs.push(auc(idx.map((i) => candS[i]), l) - auc(idx.map((i) => baseS[i]), l))
  }
  diffs.sort((x, y) => x - y)
  const q = (p: number) => (diffs.length ? diffs[Math.min(diffs.length - 1, Math.max(0, Math.floor(p * diffs.length)))] : 0)
  return { a0, a1, delta: a1 - a0, ciLow: q(0.025), ciHigh: q(0.975) }
}

function judge(delta: number, ciLow: number, ciHigh: number, coverage: number): { verdict: Verdict; reason: string } {
  const pct = Math.round(coverage * 100)
  if (coverage < GUARDS_LP.minCoverage) return { verdict: "keep_shadow", reason: `Known for only ${pct}% of the labelled LPs (needs ${GUARDS_LP.minCoverage * 100}%), so it cannot be judged.` }
  const span = `${delta >= 0 ? "+" : ""}${r3(delta)} (interval ${r3(ciLow)} to ${r3(ciHigh)})`
  if (ciHigh < 0) return { verdict: "retire", reason: `It makes the ranking worse: ${span}.` }
  if (delta >= GUARDS_LP.minAucGain && ciLow > 0) return { verdict: "promote", reason: `It puts fits above not-fits more often: ${span}, and the whole interval is above zero.` }
  if (delta >= GUARDS_LP.minAucGain) return { verdict: "keep_shadow", reason: `A gain of ${span}, but the interval includes zero: with this many labels it may be chance. More labels would settle it.` }
  return { verdict: "keep_shadow", reason: `No measurable gain: ${span} (needs +${GUARDS_LP.minAucGain}).` }
}

export function evaluateFactors(rows: EvalRow[], settings: FactorSettings): EvalReport {
  const fit = rows.filter((r) => r.label === 1).length, notFit = rows.length - fit
  const bySource = { founder_set: rows.filter((r) => r.source === "founder_set").length, feedback: rows.filter((r) => r.source === "feedback").length }
  const weights = Object.fromEntries(SHADOW_KEYS.map((k) => [k, settings[k].weight])) as Record<ShadowKey, number>
  const baselineAuc = rows.length && fit && notFit ? auc(rows.map((r) => r.base), rows.map((r) => r.label)) : 0.5
  const need: string[] = []
  if (rows.length < GUARDS_LP.minLabelled) need.push(`${GUARDS_LP.minLabelled} labelled LPs in the run (there are ${rows.length})`)
  if (fit < GUARDS_LP.minFit) need.push(`${GUARDS_LP.minFit} marked fit (${fit})`)
  if (notFit < GUARDS_LP.minNotFit) need.push(`${GUARDS_LP.minNotFit} marked not a fit (${notFit})`)
  const blocked = need.length ? `Not enough labels to judge any factor yet. It needs ${need.join(", ")}.` : null

  const one = (key: ShadowKey | "all", keys: ShadowKey[]): FactorResult => {
    const known = rows.filter((r) => keys.some((k) => r.values[k] != null)).length
    const coverage = rows.length ? known / rows.length : 0
    const weight = key === "all" ? 0 : weights[key]
    const status = key === "all" ? "" : settings[key].status
    if (blocked) return { key, weight, status, coverage: r3(coverage), auc: r3(baselineAuc), delta: 0, ciLow: 0, ciHigh: 0, verdict: "keep_shadow", reason: blocked }
    const c = compare(rows, keys, weights)
    const j = judge(c.delta, c.ciLow, c.ciHigh, coverage)
    return { key, weight, status, coverage: r3(coverage), auc: r3(c.a1), delta: r3(c.delta), ciLow: r3(c.ciLow), ciHigh: r3(c.ciHigh), ...j }
  }
  return { n: rows.length, fit, notFit, bySource, baselineAuc: r3(baselineAuc), blocked, factors: SHADOW_KEYS.map((k) => one(k, [k])), combined: one("all", [...SHADOW_KEYS]) }
}

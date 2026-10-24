/**
 * Funds that fit an investor (docs/architecture/63 M7, 64 section 5): the LP matching inverted. The subject is one of the investor's entities and what it says it looks at; the
 * candidates are listed funds and what each states about itself. Pure: facts in, a number with reasons, gaps and a confidence out.
 *
 * Two questions are kept apart. *Eligibility* is the fund's own rules against the entity (may this investor take part at all). *Fit* is how well the fund's stated focus matches the
 * investor's stated interests. Fit is computed only on what both sides state, so a thin listing is flagged as low confidence, not punished. Neither is advice: the page says it
 * compares what funds say about themselves with what the investor says they want.
 */
import { sectorGroupOf, sectorLabel } from "@/lib/matching/normalize/sectors"
import { normalizeStages, stageDistance, type Stage } from "@/lib/matching/normalize/stages"
import { countryName, resolveGeo, resolveTargets } from "@/lib/matching/normalize/geo"

export const CATEGORIES = ["professional", "semi_professional", "other", "unsure"] as const
export type Category = (typeof CATEGORIES)[number]
const CATEGORY_LABEL: Record<Category, string> = { professional: "a professional investor", semi_professional: "a semi-professional investor", other: "another kind of investor", unsure: "not sure which kind of investor" }

export interface Interests { stages: string[]; sectors: string[]; geographies: string[]; ticketMin: number | null; ticketMax: number | null; horizonYears: number | null }
export interface EntityFacts { country: string | null; taxResidence: string | null; category: Category | null; interests: Interests }
export interface Rules { categories: Category[]; countries: string[]; excludedCountries: string[]; minTicket: number | null; professionalOnly: boolean }
export interface FundFacts {
  fundId: string; name: string; status: string | null
  sectors: string[]; stages: string[]; geographies: string[]
  minCommitment: number | null; termYears: number | null
  /** The fund's currency; amounts are compared as numbers and shown in this currency. */
  currency?: string | null
  rules: Rules
}

export type Eligibility = "eligible" | "unclear" | "ineligible"
export interface EligibilityResult { status: Eligibility; failed: string[]; unclear: string[] }
export type Confidence = "high" | "medium" | "low"
export interface Factor { key: "sectors" | "stage" | "geography" | "ticket" | "horizon"; label: string; max: number; earned: number; judged: boolean; note: string }
export interface FitResult { score: number | null; confidence: Confidence; factors: Factor[]; reasons: string[]; gaps: string[] }
export interface FundFit { fundId: string; name: string; eligibility: EligibilityResult; fit: FitResult; sentence: string }

/** Funds in these stages are not taking new investors. */
export const NOT_RAISING = new Set(["closed", "harvesting", "liquidated"])
const WEIGHTS = { sectors: 35, stage: 20, geography: 15, ticket: 20, horizon: 10 } as const
const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CHF: "CHF " }
/** An amount in the fund's currency (a symbol where there is one, the code otherwise; dollars only when the fund states none). */
export const money = (n: number, currency?: string | null) => {
  const c = (currency ?? "USD").toUpperCase(), sym = SYMBOL[c] ?? `${c} `
  return n >= 1e9 ? `${sym}${+(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${sym}${+(n / 1e6).toFixed(1)}M` : `${sym}${Math.round(n / 1e3)}K`
}
/** The smallest amount the fund takes for eligibility: the manager's own rule when one is set (it is the manager's explicit choice), otherwise the fund's stated minimum commitment. */
export const effectiveMinimum = (f: Pick<FundFacts, "rules" | "minCommitment">): number | null => { const m = f.rules.minTicket ?? f.minCommitment ?? 0; return m > 0 ? m : null }
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.length === 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`)
const sectorIds = (xs: string[]) => [...new Set(xs.map((s) => sectorGroupOf(s)?.id).filter((x): x is string => !!x))]
const iso = (...t: (string | null)[]) => resolveGeo(...t).country

/** May this entity take part, by the fund's own rules? A needed fact that is missing is "unclear", never a pass. */
export function checkEligibility(e: EntityFacts, f: FundFacts): EligibilityResult {
  const failed: string[] = [], unclear: string[] = []
  const r = f.rules
  if (NOT_RAISING.has((f.status ?? "").toLowerCase())) failed.push("The fund is closed to new investors.")
  const needsCategory = r.professionalOnly || r.categories.length > 0
  if (needsCategory) {
    const c = e.category
    if (!c || c === "unsure") unclear.push("The fund limits who may invest by category, and you have not said which kind of investor you are.")
    else if (r.professionalOnly && c !== "professional") failed.push(`The fund is for professional investors only, and you describe yourself as ${CATEGORY_LABEL[c]}.`)
    else if (r.categories.length && !r.categories.includes(c)) failed.push(`The fund accepts ${list(r.categories.map((x) => CATEGORY_LABEL[x]))}, and you describe yourself as ${CATEGORY_LABEL[c]}.`)
  }
  if (r.countries.length || r.excludedCountries.length) {
    const code = iso(e.country) ?? iso(e.taxResidence)
    if (!code) unclear.push("The fund limits investors by country, and your country is not set.")
    else {
      const name = countryName(code) ?? code
      if (r.excludedCountries.includes(code)) failed.push(`The fund does not take investors from ${name}.`)
      else if (r.countries.length && !r.countries.includes(code)) failed.push(`The fund takes investors from ${list(r.countries.map((c) => countryName(c) ?? c))}, and your country is ${name}.`)
    }
  }
  const min = effectiveMinimum(f)
  if (min != null && min > 0) {
    const max = e.interests.ticketMax
    if (max == null) unclear.push(`The fund's minimum is ${money(min, f.currency)}, and you have not said how much you could invest.`)
    else if (max < min) failed.push(`The fund's minimum is ${money(min, f.currency)}, above the most you say you could invest (${money(max, f.currency)}).`)
  }
  return { status: failed.length ? "ineligible" : unclear.length ? "unclear" : "eligible", failed, unclear }
}

/** How well the fund's stated focus matches what the investor says they look at. Only the factors both sides state are judged. */
export function scoreFit(e: EntityFacts, f: FundFacts): FitResult {
  const i = e.interests, factors: Factor[] = [], reasons: string[] = [], gaps: string[] = []
  const add = (key: Factor["key"], label: string, earned: number, judged: boolean, note: string) => factors.push({ key, label, max: WEIGHTS[key], earned: judged ? Math.round(earned * WEIGHTS[key] * 10) / 10 : 0, judged, note })

  // Sectors: the share of the investor's sectors the fund covers.
  const mine = sectorIds(i.sectors), theirs = sectorIds(f.sectors)
  if (mine.length && theirs.length) {
    const hit = mine.filter((s) => theirs.includes(s))
    add("sectors", "Sectors", hit.length / mine.length, true, hit.length ? `Covers ${list(hit.map(sectorLabel))}.` : `Focuses on ${list(theirs.slice(0, 3).map(sectorLabel))}, none of your sectors.`)
    if (hit.length) reasons.push(`Invests in ${list(hit.map(sectorLabel))}, which you look at`)
  } else { add("sectors", "Sectors", 0, false, ""); gaps.push(mine.length ? "The fund does not state its sectors" : "You have not said which sectors you look at") }

  // Stage: full credit for a stage the fund covers, half for the next one along.
  const myStages = normalizeStages(i.stages), fundStages = normalizeStages(f.stages)
  if (myStages.length && fundStages.length) {
    const credit = (s: Stage) => { const d = Math.min(...fundStages.map((x) => stageDistance(s, x))); return d === 0 ? 1 : d === 1 ? 0.5 : 0 }
    const avg = myStages.reduce((a, s) => a + credit(s), 0) / myStages.length
    add("stage", "Stage", avg, true, avg === 1 ? `Backs ${list(fundStages)}.` : avg > 0 ? `Backs ${list(fundStages)}, near what you look at.` : `Backs ${list(fundStages)}, not your stages.`)
    if (avg >= 0.5) reasons.push(`Stage fits: ${list(fundStages)}`)
  } else { add("stage", "Stage", 0, false, ""); gaps.push(myStages.length ? "The fund does not state its stage" : "You have not said which stages you look at") }

  // Geography: where the fund invests against where the investor wants to be exposed.
  const wantsGeo = i.geographies.length > 0, fundGeo = f.geographies.length > 0
  if (wantsGeo && fundGeo) {
    const t = resolveTargets(f.geographies)
    const covered: number[] = i.geographies.map((g): number => {
      const r = resolveGeo(g)
      if (t.global) return 1
      if (r.global) return 0.5
      if (r.countries.some((c) => t.countries.has(c))) return 1
      if (r.regions.some((x) => t.regions.has(x))) return 1
      if (r.country && [...t.regions].some((x) => resolveGeo(r.country).region === x)) return 1
      return 0
    })
    const share = covered.reduce((a, b) => a + b, 0) / covered.length
    add("geography", "Geography", share, true, share >= 1 ? "Invests where you want to be exposed." : share > 0 ? "Partly where you want to be exposed." : "Invests elsewhere than you want.")
    if (share >= 0.5) reasons.push("Invests where you want to be exposed")
  } else { add("geography", "Geography", 0, false, ""); gaps.push(wantsGeo ? "The fund does not state where it invests" : "You have not said where you want to be exposed") }

  // Ticket: your range against the fund's minimum.
  const min = effectiveMinimum(f)
  if (min != null && min > 0 && i.ticketMax != null) {
    const lo = i.ticketMin ?? i.ticketMax
    const share = i.ticketMax < min ? 0 : lo >= min ? 1 : 0.7
    add("ticket", "Cheque size", share, true, share === 1 ? `The minimum, ${money(min, f.currency)}, is within your range.` : share > 0 ? `The minimum, ${money(min, f.currency)}, is at the top of your range.` : `The minimum, ${money(min, f.currency)}, is above your range.`)
    if (share > 0) reasons.push(`The ${money(min, f.currency)} minimum fits your range`)
  } else { add("ticket", "Cheque size", 0, false, ""); gaps.push(i.ticketMax == null ? "You have not said how much you could invest" : "The fund does not state a minimum") }

  // Horizon: how long you can wait against how long the fund runs.
  if (f.termYears != null && i.horizonYears != null) {
    const share = i.horizonYears >= f.termYears ? 1 : i.horizonYears >= f.termYears - 2 ? 0.5 : 0
    add("horizon", "Time horizon", share, true, share === 1 ? `Runs ${f.termYears} years, within your horizon.` : share > 0 ? `Runs ${f.termYears} years, a little beyond your horizon.` : `Runs ${f.termYears} years, beyond your horizon.`)
    if (share === 1) reasons.push(`The ${f.termYears}-year term fits your horizon`)
  } else { add("horizon", "Time horizon", 0, false, ""); gaps.push(f.termYears == null ? "The fund does not state its term" : "You have not said your time horizon") }

  const judgedMax = factors.filter((x) => x.judged).reduce((a, x) => a + x.max, 0)
  const earned = factors.reduce((a, x) => a + x.earned, 0)
  const score = judgedMax > 0 ? Math.round((earned / judgedMax) * 100) : null
  const share = judgedMax / 100
  return { score, confidence: share >= 0.75 ? "high" : share >= 0.5 ? "medium" : "low", factors, reasons, gaps }
}

export function sentenceFor(r: FitResult, eligibility: EligibilityResult): string {
  const bits = r.reasons.length ? r.reasons.join("; ") : r.score == null ? "Not enough stated on either side to compare" : "Little of what you look at appears in its focus"
  const flag = eligibility.status === "ineligible" ? ` Not open to you as things stand: ${eligibility.failed[0]}` : eligibility.status === "unclear" ? ` Open to you if: ${eligibility.unclear[0].replace(/^The fund /, "the fund ")}` : ""
  return `${bits}.${flag}`
}

export function fitFor(e: EntityFacts, f: FundFacts): FundFit {
  const eligibility = checkEligibility(e, f), fit = scoreFit(e, f)
  return { fundId: f.fundId, name: f.name, eligibility, fit, sentence: sentenceFor(fit, eligibility) }
}

const ORDER: Record<Eligibility, number> = { eligible: 0, unclear: 1, ineligible: 2 }
/** Eligible funds first, then unclear, then ineligible (shown, flagged, never hidden); within each, the better fit first, unknown fit last, then by name. */
export function rankFunds(e: EntityFacts, funds: FundFacts[]): FundFit[] {
  return funds.map((f) => fitFor(e, f)).sort((a, b) =>
    ORDER[a.eligibility.status] - ORDER[b.eligibility.status] || (b.fit.score ?? -1) - (a.fit.score ?? -1) || a.name.localeCompare(b.name))
}

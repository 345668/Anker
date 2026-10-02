/**
 * Founder → investor scoring, version 3 — docs/architecture/11 (white paper).
 *
 *   score = 40·Thesis + 20·Stage + 15·Check + 12·Geography + 5·Lead + 4·Type + 4·Quality
 *
 * Every component is continuous in [0, 1]; must-haves are gates, not points;
 * the result is 0–100 and records each component, gate and cap so every
 * number can be explained. Pure functions — no database, no network.
 */
import { sectorProfile, sectorLabel, type SectorProfile } from "../normalize/sectors"
import { normalizeStages, stageDistance, type Stage } from "../normalize/stages"
import { resolveGeo, resolveTargets, countryName, REGION_LABELS, type Region } from "../normalize/geo"
import { investorClass, type InvestorClass } from "../normalize/classes"
import { normPhrase } from "../normalize/text"
import { activityRecency } from "../normalize/recency"
import { tierFor, type TierId } from "./types"
import type { FounderComponents, StartupProfile } from "./founder-types"

export const ENGINE_VERSION = "founder-v3"
/** Default floor: Priority B and better (doc 11 §4.10). */
export const FOUNDER_MIN_SCORE = 40
export const FOUNDER_MAX_SCORE = 100

export const WEIGHTS = { thesis: 40, stage: 20, checkSize: 15, geography: 12, lead: 5, investorType: 4, quality: 4 } as const
/** The same seven numbers, fitted rather than argued (doc 17). They still sum to 100. */
export type ScoreWeights = { [K in keyof typeof WEIGHTS]: number }

// ─── Startup context — computed once per run ───────────────────────────────

export interface StartupContext {
  stage: Stage
  sectors: SectorProfile
  primaryVertical: string | null
  ask: number
  ideal: { min: number; max: number }
  country: string | null
  region: Region | null
  targets: { countries: Set<string>; regions: Set<Region>; global: boolean }
  keywords: string[]
  wanted: Set<InvestorClass> | null
  leadSecured: boolean
  semanticAvailable: boolean
  /** The founder's city and state as normalised phrases, for proximity; empty when only a country is given. */
  place: { city: string; state: string; cityLabel: string }
  /**
   * The band of check sizes the tie-break aims at, in dollars ({0, 0} when unknown): the founder's own
   * ideal check when they gave one, otherwise a LEAD band, from a quarter of the round up to the whole
   * round. A pre-seed round needs someone who can anchor it, so among equally matched firms those whose
   * range reaches that band come first; a firm that only writes checks too small to lead, or that starts
   * above the whole round, does not.
   */
  checkSweet: { min: number; max: number }
}

/** Words that name a country or "the US" rather than a place near the founder. */
const COUNTRY_WORDS = new Set(["united states", "united states of america", "usa", "u s a", "u s", "us", "america", "uk", "united kingdom", "canada", "germany", "france"])

function startupPlace(location: string | null | undefined): StartupContext["place"] {
  const parts = String(location ?? "").split(",").map((p) => p.trim()).filter(Boolean)
  const city = parts[0] ? normPhrase(parts[0]) : ""
  if (!city || COUNTRY_WORDS.has(city)) return { city: "", state: "", cityLabel: "" }
  const state = parts[1] ? normPhrase(parts[1]) : ""
  return { city, state: COUNTRY_WORDS.has(state) ? "" : state, cityLabel: parts[0] }
}

export function startupContext(s: StartupProfile, semanticAvailable: boolean): StartupContext {
  const sectors = sectorProfile([...(s.primarySector ? [s.primarySector] : []), ...(s.sectors ?? [])])
  const primary = s.primarySector ? sectorProfile([s.primarySector]).verticals[0] ?? null : null
  const ask = Number(s.askAmount) || 0
  const lo = s.checkSizeIdealMin ?? null, hi = s.checkSizeIdealMax ?? null
  const ideal = lo != null || hi != null
    ? { min: lo ?? hi!, max: hi ?? lo! }
    : { min: Math.round(ask * 0.05), max: Math.round(ask * 0.5) }
  const geo = resolveGeo(s.location)
  const wantedTypes = (s.investorTypesWanted ?? []).map((t) => investorClass(t)).filter((c) => c !== "other")
  return {
    stage: s.stage as Stage,
    sectors,
    primaryVertical: primary ?? sectors.verticals[0] ?? null,
    ask,
    ideal,
    country: geo.country,
    region: geo.region,
    targets: resolveTargets(s.geographyTargetRegions),
    keywords: (s.thesisKeywords ?? []).map(normPhrase).filter((k) => k.length >= 3),
    wanted: wantedTypes.length ? new Set(wantedTypes) : null,
    leadSecured: s.leadStatus === "secured",
    semanticAvailable,
    place: startupPlace(s.location),
    checkSweet: lo != null || hi != null
      ? { min: lo ?? hi!, max: hi ?? lo! }
      : { min: Math.round(ask * 0.25), max: Math.round(ask) },
  }
}

// ─── Investor facts — what a record says, normalised ───────────────────────

export interface InvestorFacts {
  kind: "firm" | "person"
  sectors: SectorProfile
  stages: Stage[]
  check: { min: number | null; max: number | null } | null
  country: string | null
  region: Region | null
  global: boolean
  cls: InvestorClass
  /** Description or bio, for thesis keywords. */
  text: string
  portfolioCount: number | null
  /** Firms: share of description, stages, sectors, check present. */
  completeness: number
  // people
  hasEmail?: boolean
  emailStatus?: "valid" | "risky" | "unknown" | "invalid" | null
  hasLinkedIn?: boolean
  hasBio?: boolean
  leadInvestments?: number | null
  /** Recency of the firm's last known investment, 0–1, or null when never checked (doc 16 §2.1). */
  activityRecency?: number | null
  /** The location text as recorded, for proximity to the founder. */
  place?: string
}

// ─── Components ────────────────────────────────────────────────────────────

/** Doc 11 §4.2 — focus: a vertical match counts for less when the investor lists many verticals. */
export function focus(verticalCount: number): number {
  return 1 / (1 + 0.1 * Math.max(0, verticalCount - 3))
}

/** Doc 11 §4.2 — sector score s_sec. */
export function sectorScore(inv: SectorProfile, ctx: StartupContext): number {
  const f = focus(inv.verticals.length)
  if (ctx.primaryVertical && inv.verticals.includes(ctx.primaryVertical)) return f
  if (inv.verticals.some((v) => ctx.sectors.verticals.includes(v))) return 0.8 * f
  if (inv.generalist) return 0.45
  if (inv.horizontals.some((h) => ctx.sectors.horizontals.includes(h))) return 0.35
  if (!inv.groups.length) return 0.3 // nothing recognisable listed: unknown, not a mismatch
  return 0
}

export function keywordHits(text: string, keywords: string[]): string[] {
  if (!text || !keywords.length) return []
  const hay = ` ${normPhrase(text)} `
  return keywords.filter((k) => hay.includes(` ${k} `))
}

/** Doc 11 §4.3. */
export function stageScore(stages: Stage[], stage: Stage): number {
  if (!stages.length) return 0.35
  if (stages.includes(stage)) return 1
  if (stages.some((s) => stageDistance(s, stage) === 1)) return 0.5
  return 0
}

/** Doc 11 §4.4. */
export function checkScore(check: InvestorFacts["check"], ideal: StartupContext["ideal"]): number {
  if (!check || (check.min == null && check.max == null)) return 0.4
  const lo = check.min ?? check.max!, hi = check.max ?? check.min!
  if (!(ideal.max > 0)) return 0.4
  if (hi >= ideal.min && lo <= ideal.max) return 1
  const r = lo > ideal.max ? lo / ideal.max : ideal.min / Math.max(hi, 1)
  return Math.max(0, 1 - Math.log2(r) / 3)
}

/** Doc 11 §4.5. */
export function geographyScore(f: Pick<InvestorFacts, "country" | "region" | "global">, ctx: StartupContext): number {
  if (f.country && (f.country === ctx.country || ctx.targets.countries.has(f.country))) return 1
  if (f.region && ctx.targets.regions.has(f.region)) return 1
  if (!f.country && !f.region) return f.global ? 0.6 : 0.4
  if (ctx.targets.global || f.global) return 0.6
  if (f.region && f.region === ctx.region) return 0.6
  if (!ctx.country && !ctx.region) return 0.4
  return 0.2
}

/** Doc 11 §4.6. */
export function leadScore(f: InvestorFacts, ask: number): number {
  if ((f.leadInvestments ?? 0) > 0) return 1
  const hi = f.check?.max ?? f.check?.min ?? null
  if (hi == null || !(ask > 0)) return 0.3
  return hi >= 0.25 * ask ? 1 : 0
}

const TYPE_TABLE: Record<"early" | "mid" | "late", Partial<Record<InvestorClass, number>>> = {
  early: { vc: 1, angel: 1, accelerator: 0.8, cvc: 0.6, family_office: 0.5, pe: 0, grant: 0.5, other: 0.5 },
  mid: { vc: 1, angel: 0.4, accelerator: 0.1, cvc: 0.8, family_office: 0.6, pe: 0.5, grant: 0.2, other: 0.5 },
  late: { vc: 0.7, angel: 0.1, accelerator: 0, cvc: 0.8, family_office: 0.7, pe: 1, grant: 0, other: 0.5 },
}
/** Doc 11 §4.7 — allocators (banks, insurers, SWFs, asset managers, FoFs, endowments) share one row. */
export function typeScore(cls: InvestorClass, stage: Stage): number {
  const band = stage === "pre-seed" || stage === "seed" ? "early" : stage === "series-a" || stage === "series-b" ? "mid" : "late"
  const v = TYPE_TABLE[band][cls]
  if (v != null) return v
  return band === "early" ? 0.1 : band === "mid" ? 0.3 : 0.6
}

/**
 * Doc 11 §4.7 — evidence quality, and, when we know it, activity (doc 16 §2.1).
 *
 * A firm whose activity has never been checked scores exactly as it did before
 * activity existed: not knowing is not evidence of inactivity. Where it IS
 * known, a fifth of the component comes from how recently the firm invested,
 * so between two otherwise identical firms the demonstrably active one wins.
 */
export function qualityScore(f: InvestorFacts): number {
  if (f.kind === "firm") {
    const portfolio = f.portfolioCount && f.portfolioCount > 0 ? Math.min(1, Math.log10(f.portfolioCount + 1) / 2) : 0
    const records = 0.5 * portfolio + 0.5 * f.completeness
    if (f.activityRecency == null) return records
    return 0.8 * records + 0.2 * f.activityRecency
  }
  const email = !f.hasEmail || f.emailStatus === "invalid" ? 0
    : f.emailStatus === "valid" ? 0.6 : f.emailStatus === "risky" ? 0.25 : 0.35
  return email + (f.hasLinkedIn ? 0.2 : 0) + (f.hasBio ? 0.2 : 0)
}

// ─── Composite ─────────────────────────────────────────────────────────────

export interface V3Score {
  score: number
  tier: TierId
  components: FounderComponents
  gates: string[]
  reasons: string[]
  tags: string[]
  canLead: boolean
  why: string
  /** s_sem used, for tie-breaking. */
  semantic: number
  quality: number
  /** 0–1 ordering value inside a score band; never changes the score (see tieBreak). */
  tie: number
  /**
   * 1 when the firm's checks cover enough of the lead band to anchor the round, else 0. Compared BEFORE
   * the tie value, so inside a score band every firm that can lead comes before every firm that cannot.
   */
  leadTier: number
}

const round1 = (n: number) => Math.round(n * 10) / 10
/** Map a score above a gate into the band below it, preserving order (doc 11 §4.8). */
const into = (score: number, from: [number, number], to: [number, number]) =>
  to[0] + ((Math.min(score, from[1]) - from[0]) / (from[1] - from[0])) * (to[1] - to[0])

const STAGE_LABEL: Record<Stage, string> = {
  "pre-seed": "pre-seed", seed: "seed", "series-a": "Series A", "series-b": "Series B", "series-c": "Series C+", growth: "growth", "late-stage": "late stage",
}
const money = (n: number | null | undefined) => n == null ? "?" : n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`
const label = sectorLabel

// ─── Ordering inside a score band ──────────────────────────────────────────

/**
 * Many firms reach the same score. Every component is clamped to [0, 1] and the total to 100, so
 * for a founder whose thesis, stage and check size fit a whole class of funds, 75 of them showed
 * "100" and fell back to alphabetical order: a state fund above the healthcare specialist, and
 * nothing to separate the founder's own city from a coast away (docs/architecture/11 addendum).
 *
 * The tie-break uses what the clamps throw away, plus two things the score never looked at. It
 * only orders firms that already have the SAME displayed score; it never lifts one score above
 * another, and it is never shown as a number.
 *
 *   thesis depth  how far the thesis match goes before it is clamped (keywords, focus, text)
 *   text match    the raw semantic similarity to the deck
 *   check fit     whether the firm's range reaches a LEAD band (a quarter of the round up to the
 *                 whole round, or the founder's own ideal), and how centred it is on that band
 *   proximity     the founder's city, then state, in the firm's recorded location
 *   activity      how recently the firm invested (unknown counts as neutral, not as inactive)
 *   lead depth    how much of the round the firm could write alone
 *   evidence      record completeness and portfolio size
 */
/** A firm leads when it covers about half the lead band or better: the fit score at which a range that spans
 *  half of it (a $500K-$5M fund against $250K-$1M) still counts, and one that only touches its edge does not. */
export const LEAD_FIT_MIN = 0.45

export const TIE_WEIGHTS = { thesis: 0.25, text: 0.12, check: 0.18, proximity: 0.15, activity: 0.12, lead: 0.08, evidence: 0.1 } as const

const log2 = (n: number) => Math.log(n) / Math.log(2)

/**
 * How well a firm's check range fits the band we are aiming at (0.4 when either is unknown, as in the
 * score).
 *
 * Two things are measured, both on a log scale because check sizes are ratios: how much of the band the
 * firm's range COVERS (70%), and how near its typical check sits to the middle of the band (30%).
 * Touching is not covering. A $25K-$250K angel against a $250K-$1M band reaches it at a single point, so
 * it covers none of it and scores at most 0.3, below a firm whose $250K-$2M range spans the whole band;
 * before this, "overlaps at all" scored 0.75 and above, which let that angel outrank lead funds. A range
 * that misses the band entirely also scores at most 0.3, falling with the distance. A firm writing
 * $500K-$2M still covers most of a $375K-$1.5M band, so it can lead a $1.5M round though $375K is below
 * its range.
 */
export function checkFit(check: InvestorFacts["check"], sweet: { min: number; max: number }): number {
  const lo = check?.min ?? check?.max ?? null, hi = check?.max ?? check?.min ?? null
  if (lo == null || hi == null || lo <= 0 || hi <= 0 || !(sweet.min > 0) || !(sweet.max >= sweet.min)) return 0.4
  const fLo = log2(lo), fHi = log2(Math.max(hi, lo))
  const bLo = log2(sweet.min), bHi = log2(sweet.max)
  const width = bHi - bLo
  // A single target size (an explicit ideal with min = max) is covered or it is not.
  const overlap = width < 0.01 ? (fLo <= bLo && bHi <= fHi ? 1 : 0) : Math.max(0, Math.min(fHi, bHi) - Math.max(fLo, bLo))
  const coverage = width < 0.01 ? overlap : Math.min(1, overlap / width)
  const centering = 1 / (1 + Math.abs((fLo + fHi) / 2 - (bLo + bHi) / 2) / 1.5)
  if (coverage > 0) return 0.7 * coverage + 0.3 * centering
  const gap = fHi < bLo ? bLo - fHi : fLo > bHi ? fLo - bHi : 0
  return 0.3 / (1 + gap / 1.5)
}

export function proximity(place: string | undefined, ctx: StartupContext): number {
  if (!place || !ctx.place.city) return 0
  const hay = ` ${normPhrase(place)} `
  const city = hay.includes(` ${ctx.place.city} `) ? 1 : 0
  const state = ctx.place.state && hay.includes(` ${ctx.place.state} `) ? 1 : 0
  return 0.7 * city + 0.3 * state
}

export function tieBreak(f: InvestorFacts, ctx: StartupContext, p: { thesisRaw: number; sem: number | null }): number {
  const hi = f.check?.max ?? f.check?.min ?? null
  const lead = f.kind === "person"
    ? Math.min(1, Math.log10(1 + (f.leadInvestments ?? 0)) / 1.5)
    : hi != null && ctx.ask > 0 ? Math.min(1, hi / ctx.ask) : 0.3
  const parts = {
    thesis: Math.max(0, Math.min(1, p.thesisRaw / 1.15)),
    text: p.sem ?? 0.5,
    check: checkFit(f.check, ctx.checkSweet),
    proximity: proximity(f.place, ctx),
    activity: f.activityRecency ?? 0.5,
    lead,
    evidence: qualityScore(f),
  }
  let t = 0
  for (const k of Object.keys(TIE_WEIGHTS) as (keyof typeof TIE_WEIGHTS)[]) t += TIE_WEIGHTS[k] * parts[k]
  return Math.round(t * 1e6) / 1e6
}

export function scoreInvestor(f: InvestorFacts, ctx: StartupContext, sSem: number, w: ScoreWeights = WEIGHTS): V3Score {
  const sSec = sectorScore(f.sectors, ctx)
  const kws = keywordHits(f.text, ctx.keywords)
  const k = Math.min(0.15, 0.05 * kws.length)
  // Specialists are ordered by how closely their thesis reads like the deck;
  // for everyone else semantic evidence can promote, never demote (doc 11 §4.2).
  const isVertical = sSec >= 0.6
  const base = !ctx.semanticAvailable ? sSec
    : isVertical ? sSec * (0.85 + 0.15 * sSem)
    : Math.max(sSec, 0.6 * sSec + 0.4 * sSem)
  const T = Math.min(1, base + k)
  const S = stageScore(f.stages, ctx.stage)
  const C = checkScore(f.check, ctx.ideal)
  const G = geographyScore(f, ctx)
  const L = leadScore(f, ctx.ask)
  const Y = typeScore(f.cls, ctx.stage)
  const Q = qualityScore(f)

  // A secured lead moves lead capacity's weight onto check-size fit (doc 11 §4.6).
  const wCheck = w.checkSize + (ctx.leadSecured ? w.lead : 0)
  const wLead = ctx.leadSecured ? 0 : w.lead
  const pts = {
    thesis: w.thesis * T, stage: w.stage * S, checkSize: wCheck * C, geography: w.geography * G,
    lead: wLead * L, investorType: w.investorType * Y, quality: w.quality * Q,
  }
  // Gates compare the score as shown (one decimal): 79.96 displays as 80.0, so it must pass the Champion gate to keep it.
  let score = round1(Object.values(pts).reduce((a, b) => a + b, 0))
  const gates: string[] = []

  if (S === 0) { score *= 0.5; gates.push("stage_mismatch") }
  if (ctx.wanted && !ctx.wanted.has(f.cls)) { score *= 0.7; gates.push("type_not_wanted") }
  if (sSec === 0 && (!ctx.semanticAvailable || sSem < 0.2) && score > 45) { score = into(score, [45, 100], [35, 45]); gates.push("off_thesis") }
  if (score >= 80 && !(T >= 0.75 && S === 1 && G >= 0.6)) { score = into(score, [80, 100], [70, 79.9]); gates.push("champion_gate") }
  if (score >= 60 && !(T >= 0.45 && S >= 0.5)) { score = into(score, [60, 100], [50, 59.9]); gates.push("priority_a_gate") }

  const components: FounderComponents = {
    thesis: { value: T, points: pts.thesis, sector: sSec, semantic: ctx.semanticAvailable ? sSem : null, keywords: kws },
    stage: { value: S, points: pts.stage },
    checkSize: { value: C, points: pts.checkSize, range: f.check ? [f.check.min, f.check.max] : null },
    geography: { value: G, points: pts.geography },
    lead: { value: L, points: pts.lead },
    investorType: { value: Y, points: pts.investorType },
    quality: { value: Q, points: pts.quality },
  }

  // ─── Explanation (doc 11 §7): only facts that scored ───────────────────
  const reasons: string[] = []
  const shared = f.sectors.verticals.filter((v) => ctx.sectors.verticals.includes(v))
  const primaryMatch = !!ctx.primaryVertical && f.sectors.verticals.includes(ctx.primaryVertical)
  const focused = focus(f.sectors.verticals.length) >= 0.9
  if (primaryMatch && focused) reasons.push(`${label(ctx.primaryVertical!)} specialist`)
  else if (shared.length) reasons.push(`Invests in ${shared.map(label).join(", ")}${focused ? "" : ` among ${f.sectors.verticals.length} sectors`}`)
  else if (sSec === 0.45) reasons.push("Generalist")
  else if (sSec === 0.35) reasons.push(`Generalist (${f.sectors.horizontals.filter((h) => ctx.sectors.horizontals.includes(h)).map(label).join(", ")})`)
  if (ctx.semanticAvailable && sSem >= 0.6) reasons.push("thesis text matches your deck")
  if (kws.length) reasons.push(`mentions ${kws.slice(0, 2).join(", ")}`)
  if (S === 1) reasons.push(`invests at ${STAGE_LABEL[ctx.stage]}`)
  else if (S === 0.5) reasons.push(`adjacent stage (${f.stages.map((s) => STAGE_LABEL[s]).join(", ")})`)
  else if (S === 0) reasons.push("stage mismatch")
  if (f.check && C === 1) reasons.push(`${money(f.check.min)}–${money(f.check.max)} checks fit your ${money(ctx.ask)} round`)
  else if (f.check && C < 1) reasons.push(`${money(f.check.min)}–${money(f.check.max)} checks, outside your range`)
  if (f.activityRecency === 1) reasons.push("invested in the last 6 months")
  else if (f.activityRecency === 0) reasons.push("no investment on record for 2 years")
  if (proximity(f.place, ctx) >= 0.7) reasons.push(`based in ${ctx.place.cityLabel}`)
  if (G === 1 && f.country) reasons.push(countryName(f.country) ?? f.country)
  else if (G >= 0.6 && f.region) reasons.push(REGION_LABELS[f.region])
  else if (G === 0.2 && f.country) reasons.push(`${countryName(f.country) ?? f.country} (outside your region)`)
  const thesisConfirmed = T >= 0.75
  const why = reasons.length ? reasons[0][0].toUpperCase() + reasons.join(" · ").slice(1) + (thesisConfirmed ? "" : " — thesis not confirmed") : "Limited data."

  const tags: string[] = []
  if (primaryMatch && focused) tags.push("PRIMARY")
  if (shared.length) tags.push("VERTICAL")
  if (S === 1) tags.push("STAGE")
  if (L === 1 && !ctx.leadSecured) tags.push("LEAD")
  if (f.country && f.country === ctx.country) tags.push("LOCAL")
  if (G === 0.2) tags.push("INTL")
  if (ctx.semanticAvailable && sSem >= 0.6) tags.push("SEMANTIC")

  const finalScore = round1(Math.max(0, Math.min(100, score)))
  const tie = tieBreak(f, ctx, { thesisRaw: base + k, sem: ctx.semanticAvailable ? sSem : null })
  const leadTier = checkFit(f.check, ctx.checkSweet) >= LEAD_FIT_MIN ? 1 : 0
  return {
    score: finalScore, tier: tierFor(finalScore), components, gates, reasons, tags,
    canLead: L === 1, why, semantic: sSem, quality: Q, tie, leadTier,
  }
}

// ─── Record → facts ────────────────────────────────────────────────────────

const present = (v: unknown) => v != null && v !== "" && !(Array.isArray(v) && !v.length)

export function firmFacts(r: any, now = new Date()): InvestorFacts {
  const geo = resolveGeo(r.hq_location, r.location)
  const range = r.check_min != null || r.check_max != null
    ? { min: num(r.check_min), max: num(r.check_max) }
    : r.check_size_min != null || r.check_size_max != null ? { min: num(r.check_size_min), max: num(r.check_size_max) } : null
  const sectors = sectorProfile([...list(r.sectors), ...list(r.industry)])
  const stages = normalizeStages(r.stages)
  return {
    kind: "firm", sectors, stages, check: range, country: geo.country, region: geo.region, global: geo.global,
    cls: (r.norm_class as InvestorClass) || investorClass(r.firm_classification, r.type),
    text: String(r.description ?? ""), portfolioCount: num(r.portfolio_count),
    completeness: [present(r.description), stages.length > 0, sectors.groups.length > 0, range != null].filter(Boolean).length / 4,
    activityRecency: r.activity_checked_at ? activityRecency(r.last_investment_at ?? null, now) ?? 0 : null,
    place: String(r.hq_location ?? r.location ?? ""),
  }
}

export function personFacts(r: any, emailStatus: InvestorFacts["emailStatus"]): InvestorFacts {
  const geo = resolveGeo(r.investor_country, r.location, r.hq_location)
  const range = r.check_min != null || r.check_max != null ? { min: num(r.check_min), max: num(r.check_max) } : null
  return {
    kind: "person", sectors: sectorProfile(r.sectors), stages: normalizeStages([...list(r.stages), ...list(r.funding_stage)]),
    check: range, country: geo.country, region: geo.region, global: geo.global,
    cls: (r.norm_class as InvestorClass) || investorClass(r.investor_type),
    text: String(r.bio ?? ""), portfolioCount: num(r.total_investments), completeness: 0,
    hasEmail: present(r.email), emailStatus, hasLinkedIn: present(r.linkedin), hasBio: present(r.bio) && String(r.bio).length > 40,
    leadInvestments: num(r.num_lead_investments),
    place: String(r.location ?? r.hq_location ?? ""),
  }
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
function list(v: unknown): unknown[] {
  if (v == null || v === "") return []
  if (Array.isArray(v)) return v
  if (typeof v === "string" && v.trim().startsWith("[")) { try { const p = JSON.parse(v); if (Array.isArray(p)) return p } catch { /* use as text */ } }
  return [v]
}

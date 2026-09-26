/**
 * LP scoring, version 2 — docs/architecture/19 (white paper).
 *
 *   score = 25·Capacity + 25·LpType + 20·Thesis + 15·Sector + 10·Geography + 5·Evidence
 *
 * Every component is continuous in [0, 1]; the weights sum to 100; must-haves
 * are gates that move a score into the band below rather than points. The same
 * scale scores firms and people, so a tier means one thing (doc 19 §2).
 *
 * The previous model added absolute points to a maximum of 118 — and because a
 * person has no AUM, their ceiling was 93, which is why no contact ever
 * reached Champion. Capacity was "AUM ≥ $500M" with the fund's own raise
 * nowhere in it, so two thirds of every result was tagged as an anchor.
 *
 * Pure functions, no I/O.
 */

import { hasSectorOverlap, scanThesisSignals } from "../industry-synonyms"
import { PhraseMap } from "../normalize/text"
import type { FactorBreakdown, FundProfileV2 } from "./types"
import { raiseBand, scoreCapacity, type Capacity } from "./lp-capacity"

// ═══════════════════════════════════════════════════════════════════════════
// 1. LP TYPE  (+12 to +28)
// ═══════════════════════════════════════════════════════════════════════════

export const LP_TYPE_POINTS = {
  fund_of_funds: 28,
  family_office: 25,
  sovereign_wealth: 25,
  endowment: 22,
  pension: 22,
  institutional_other: 22, // foundations, hospitals, etc.
  asset_wealth_manager: 15,
  insurance: 15,
  bank: 12,
  hnw_angel: 12, // only if 2+ HNW signals in bio
  lp_signal_bio: 10, // bio mentions allocating to funds
} as const

export type LpTypeKey = keyof typeof LP_TYPE_POINTS

// Word-boundary matchers — fixes "family business" false-positive bug.
const LP_TYPE_MATCHERS: { key: LpTypeKey; patterns: RegExp[] }[] = [
  { key: "fund_of_funds", patterns: [/\bfund of funds?\b/i, /\bfof\b/i, /\bfund-of-funds?\b/i] },
  {
    key: "family_office",
    patterns: [
      /\bfamily office\b/i,
      /\bsingle family office\b/i,
      /\bmulti[- ]family office\b/i,
      /\bMFO\b/,
      /\bSFO\b/,
    ],
  },
  { key: "sovereign_wealth", patterns: [/\bsovereign wealth\b/i, /\bSWF\b/, /\bsovereign fund\b/i] },
  { key: "endowment", patterns: [/\bendowment\b/i, /\buniversity endowment\b/i] },
  { key: "pension", patterns: [/\bpension\b/i, /\bretirement system\b/i, /\bsuperannuation\b/i] },
  { key: "institutional_other", patterns: [/\bfoundation\b/i, /\binstitutional investor\b/i] },
  {
    key: "asset_wealth_manager",
    patterns: [/\basset manager\b/i, /\bwealth manager\b/i, /\basset & wealth\b/i, /\bRIA\b/],
  },
  { key: "insurance", patterns: [/\binsurance company\b/i, /\binsurer\b/i, /\breinsurance\b/i] },
  { key: "bank", patterns: [/\bprivate bank\b/i, /\bbank\b/i] },
]

// Disqualifiers — these are NOT LPs; engine should filter them out upstream.
export const NON_LP_PATTERNS = [
  /\bventure capital\b/i,
  /\bventure fund\b/i,
  /\bVC\b/,
  /\baccelerator\b/i,
  /\bincubator\b/i,
  /\bcorporate venture\b/i,
  /\bCVC\b/,
  /\bgovernment grant\b/i,
]

export function isNonLp(typeOrDescription: string | null | undefined): boolean {
  if (!typeOrDescription) return false
  return NON_LP_PATTERNS.some((p) => p.test(typeOrDescription))
}

export function classifyLpType(
  firmType: string | null | undefined,
  description?: string | null,
): { key: LpTypeKey | null; points: number; tag: string } {
  const haystack = [firmType ?? "", description ?? ""].join(" ")
  if (isNonLp(haystack)) return { key: null, points: 0, tag: "" }

  for (const m of LP_TYPE_MATCHERS) {
    if (m.patterns.some((p) => p.test(haystack))) {
      return {
        key: m.key,
        points: LP_TYPE_POINTS[m.key],
        tag: tagForLpType(m.key),
      }
    }
  }

  // Bio-only LP signals (asset allocator language without explicit type)
  const lpSignals = [
    /\blimited partner\b/i,
    /\ballocate to\b.*\bfunds?\b/i,
    /\binvests? in\b.*\bfunds?\b/i,
    /\banchor investor\b/i,
    /\bemerging manager\b/i,
  ]
  if (description && lpSignals.some((p) => p.test(description))) {
    return { key: "lp_signal_bio", points: LP_TYPE_POINTS.lp_signal_bio, tag: "LP-Signal" }
  }

  return { key: null, points: 0, tag: "" }
}

export function tagForLpType(key: LpTypeKey): string {
  return {
    fund_of_funds: "FoF",
    family_office: "FO",
    sovereign_wealth: "SWF",
    endowment: "ENDOW",
    pension: "PENSION",
    institutional_other: "INST",
    asset_wealth_manager: "AWM",
    insurance: "INS",
    bank: "BANK",
    hnw_angel: "HNW-Angel",
    lp_signal_bio: "LP-Signal",
  }[key]
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. AUM CAPACITY  (+5 to +25)
// ═══════════════════════════════════════════════════════════════════════════

export interface AumScore {
  points: number
  isAnchor: boolean
  parsedUsd: number | null
  description: string
}

export function parseAumToUsd(aum: string | null | undefined): number | null {
  if (!aum) return null
  const lower = aum.toLowerCase().replace(/,/g, "").trim()
  // Range form like "$500M-$1B" → take the lower bound for a conservative read
  const range = lower.match(/\$?([\d.]+)\s*([tbmk])\s*[-–—]\s*\$?([\d.]+)\s*([tbmk])/i)
  if (range) {
    const lo = scaleAmount(parseFloat(range[1]), range[2])
    const hi = scaleAmount(parseFloat(range[3]), range[4])
    if (lo !== null && hi !== null) return lo
  }
  const single = lower.match(/\$?([\d.]+)\s*(trillion|billion|bn|million|mn|thousand|t|b|m|k)?/i)
  if (single) {
    return scaleAmount(parseFloat(single[1]), single[2] ?? "")
  }
  return null
}

function scaleAmount(n: number, unit: string): number | null {
  if (isNaN(n)) return null
  const u = unit.toLowerCase()
  if (u.startsWith("t")) return n * 1e12
  if (u.startsWith("b")) return n * 1e9
  if (u.startsWith("m")) return n * 1e6
  if (u.startsWith("k") || u.startsWith("th")) return n * 1e3
  return n
}

export function scoreAum(aum: string | null | undefined): AumScore {
  const usd = parseAumToUsd(aum)
  if (usd === null) return { points: 0, isAnchor: false, parsedUsd: null, description: "AUM unknown" }
  if (usd >= 1e9) return { points: 25, isAnchor: true, parsedUsd: usd, description: `$${(usd / 1e9).toFixed(1)}B AUM (anchor)` }
  if (usd >= 5e8) return { points: 20, isAnchor: true, parsedUsd: usd, description: `$${(usd / 1e6).toFixed(0)}M AUM (anchor)` }
  if (usd >= 2e8) return { points: 15, isAnchor: false, parsedUsd: usd, description: `$${(usd / 1e6).toFixed(0)}M AUM` }
  if (usd >= 1e8) return { points: 10, isAnchor: false, parsedUsd: usd, description: `$${(usd / 1e6).toFixed(0)}M AUM` }
  if (usd >= 5e7) return { points: 5, isAnchor: false, parsedUsd: usd, description: `$${(usd / 1e6).toFixed(0)}M AUM` }
  return { points: 0, isAnchor: false, parsedUsd: usd, description: `$${(usd / 1e6).toFixed(1)}M AUM (sub-scale)` }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. SECTOR ALIGNMENT  (+8 to +20)
// ═══════════════════════════════════════════════════════════════════════════

export function scoreSector(
  entitySectors: string[],
  fund: FundProfileV2,
): { points: number; matched: string[]; isSweetSpot: boolean } {
  if (!entitySectors.length || !fund.sectors.length) {
    return { points: 0, matched: [], isSweetSpot: false }
  }

  const overlap = hasSectorOverlap(entitySectors, fund.sectors)
  if (!overlap.overlap) return { points: 0, matched: [], isSweetSpot: false }

  // Sweet-spot bonus: if entity hits ALL primary sectors (e.g. healthcare + edtech for SVS).
  let isSweetSpot = false
  if (fund.primarySectors && fund.primarySectors.length >= 2) {
    const primaryOverlap = hasSectorOverlap(entitySectors, fund.primarySectors)
    if (primaryOverlap.matched.length >= fund.primarySectors.length) {
      isSweetSpot = true
    }
  }

  if (isSweetSpot) return { points: 20, matched: overlap.matched, isSweetSpot: true }
  if (overlap.matched.length >= 3) return { points: 15, matched: overlap.matched, isSweetSpot: false }
  return { points: 8, matched: overlap.matched, isSweetSpot: false }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. GEOGRAPHY  (+1 to +22)
// ═══════════════════════════════════════════════════════════════════════════

const GEO_REGIONS: Record<string, string[]> = {
  utah: ["utah", "lehi", "salt lake", "provo", "park city", "sandy", "orem", "ogden", "draper", "farmington"],
  mountain_west: ["colorado", "denver", "boulder", "idaho", "boise", "wyoming", "montana", "arizona", "phoenix", "tucson", "nevada", "las vegas", "reno", "new mexico", "albuquerque"],
  us_west: ["california", "san francisco", "los angeles", "seattle", "portland", "bay area", "silicon valley", "sf", "la"],
  us_east: ["new york", "boston", "washington dc", "philadelphia", "miami", "atlanta", "chicago", "nyc"],
  us: ["united states", "usa", "u.s.", "america"],
  canada: ["canada", "toronto", "vancouver", "montreal", "calgary", "ottawa"],
  dach: ["germany", "deutschland", "austria", "switzerland", "schweiz", "berlin", "munich", "münchen", "zurich", "zürich", "frankfurt", "vienna", "wien", "hamburg", "geneva"],
  gulf: ["uae", "u.a.e.", "dubai", "abu dhabi", "saudi", "saudi arabia", "ksa", "qatar", "bahrain", "kuwait", "oman", "riyadh", "doha", "manama"],
  italy: ["italy", "italia", "milan", "milano", "rome", "roma", "florence", "firenze"],
  uk: ["uk", "united kingdom", "london", "england", "scotland", "wales", "edinburgh", "manchester"],
  france: ["france", "paris", "lyon", "marseille"],
  india: ["india", "mumbai", "bangalore", "bengaluru", "delhi", "hyderabad", "pune", "chennai"],
  singapore: ["singapore"],
  japan: ["japan", "tokyo", "osaka"],
  china: ["china", "beijing", "shanghai", "shenzhen", "hong kong"],
}

// Whole words only. The substring test this replaces found "la" (Los Angeles)
// inside "Netherlands", "Switzerland", "Poland" and "Lagos", and placed 1,648
// non-US firms in the US. Region phrases that contain "america" map to no
// region, so "Latin America" is not read as the US.
const REGION_PHRASES = (() => {
  const m = new PhraseMap<string | null>()
  for (const [region, kws] of Object.entries(GEO_REGIONS)) for (const k of kws) m.set(k, region)
  // "north america" IS a region — it is the continent the US and Canada sit in,
  // and funds state it as their geography constantly. It used to map to null
  // alongside the other "… america" phrases, which were nulled to stop "Latin
  // America" being read as the US. That guard was right for the others and wrong
  // for this one: a fund whose HQ or focus read "North America" produced NO
  // regions, so every US branch below (all gated on the fund's regions) fell
  // through and a New York allocator scored the same 1 point as one in Daejeon.
  for (const p of ["latin america", "south america", "central america"]) m.set(p, null)
  m.set("north america", "north_america")
  m.set("north american", "north_america")
  return m
})()

/**
 * Regions that contain other regions. A fund focused on `north_america` matches
 * an LP in `us_east`; a fund focused on `us` matches one in `utah`. Without this
 * the model can only match on exactly the string both sides happened to use.
 */
const REGION_PARENTS: Record<string, string[]> = {
  us: ["north_america"],
  us_east: ["us", "north_america"],
  us_west: ["us", "north_america"],
  utah: ["us", "north_america"],
  mountain_west: ["us", "north_america"],
  canada: ["north_america"],
}

/** A region plus everything that contains it. */
export function withParents(regions: Iterable<string>): Set<string> {
  const out = new Set<string>()
  const add = (r: string) => {
    if (out.has(r)) return
    out.add(r)
    for (const p of REGION_PARENTS[r] ?? []) add(p)
  }
  for (const r of regions) add(r)
  return out
}

export function detectRegions(location: string | null | undefined): string[] {
  if (!location) return []
  const out = new Set<string>()
  for (const r of REGION_PHRASES.findAll(location)) if (r) out.add(r)
  return Array.from(out)
}

export interface GeoScore {
  points: number
  tag: string | null
  description: string
  /**
   * The fund states where it invests and this LP is not there.
   *
   * Distinct from simply scoring low: an LP outside a fund's stated geography is
   * usually unreachable for that fund rather than slightly worse, so `assemble`
   * demotes it a band instead of letting a strong sector match carry it to the
   * top of the list (§6).
   */
  outOfFocus: boolean
}

export function scoreGeography(
  location: string | null | undefined,
  fund: FundProfileV2,
): GeoScore {
  const hqRegions = withParents(detectRegions(fund.headquartersLocation))
  const focusRegions = withParents(
    fund.geographicFocus.flatMap((g) => [g.toLowerCase().trim(), ...detectRegions(g)]).filter(Boolean),
  )
  // Only a focus we could actually resolve counts as "stated". A fund listing
  // regions we cannot parse must not have every LP demoted for being outside a
  // geography the model does not understand.
  const statesFocus = focusRegions.size > 0

  if (!location) return { points: 0, tag: null, description: "No location data", outOfFocus: false }
  const own = detectRegions(location)
  if (!own.length) {
    return { points: 1, tag: null, description: `Unrecognized: ${location}`, outOfFocus: false }
  }
  const regions = withParents(own)
  const inFocus = statesFocus && [...regions].some((r) => focusRegions.has(r))

  // Local — the fund's own home region, and a specific one rather than a continent.
  for (const r of hqRegions) {
    if (["utah", "mountain_west", "dach", "gulf", "italy", "uk", "france", "canada", "india", "singapore", "japan", "china"].includes(r) && regions.has(r)) {
      return { points: 22, tag: "LOCAL", description: `Local: ${location}`, outOfFocus: false }
    }
  }

  // The fund's stated investment geography. This no longer depends on the fund's
  // HQ resolving to a region — a fund headquartered at "North America" still has
  // a focus, and its LPs in New York are in it.
  if (inFocus) {
    return { points: 18, tag: "TARGET-GEO", description: `Matches investment geography: ${location}`, outOfFocus: false }
  }

  if (hqRegions.has("utah") && regions.has("mountain_west")) {
    return { points: 15, tag: "MTN-WEST", description: `Mountain West: ${location}`, outOfFocus: false }
  }

  // Same continent as the fund, when the fund's HQ or focus places it on one.
  if (regions.has("north_america") && (hqRegions.has("north_america") || focusRegions.has("north_america"))) {
    return { points: 12, tag: "US", description: `North America: ${location}`, outOfFocus: false }
  }

  // Everything below here is outside a stated focus, when one exists.
  const out = statesFocus && !inFocus
  if (regions.has("gulf") || regions.has("canada")) {
    return { points: out ? 3 : 6, tag: regions.has("gulf") ? "GULF" : "CANADA", description: location, outOfFocus: out }
  }
  if (regions.has("dach")) return { points: out ? 2 : 5, tag: "DACH", description: location, outOfFocus: out }
  if (regions.has("italy")) return { points: out ? 2 : 5, tag: "ITALY", description: location, outOfFocus: out }
  if (regions.has("uk")) return { points: out ? 2 : 4, tag: "UK", description: location, outOfFocus: out }
  return {
    points: out ? 0 : 1,
    tag: out ? "OUT-OF-GEO" : "INTL",
    description: out ? `Outside the fund's stated geography: ${location}` : `International: ${location}`,
    outOfFocus: out,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. THESIS SIGNALS  (+8 to +18)
// ═══════════════════════════════════════════════════════════════════════════

export interface ThesisScore {
  points: number
  matched: string[]
  signalTags: string[] // UNI / STUDIO / EM / IP / MICROPE / EXIT
}

const THESIS_SIGNAL_GROUPS: { tag: string; points: number; patterns: RegExp[] }[] = [
  {
    tag: "UNI",
    points: 18,
    patterns: [
      /\buniversit(y|ies)\b/i,
      /\btech transfer\b/i,
      /\bresearch institut/i,
      /\bspin[- ]?out/i,
      /\bspin[- ]?off/i,
      /\bIP commercializ/i,
    ],
  },
  {
    tag: "STUDIO",
    points: 15,
    patterns: [/\bventure studio\b/i, /\bstartup studio\b/i, /\bventure builder\b/i, /\bcompany builder\b/i],
  },
  {
    tag: "EM",
    points: 15,
    patterns: [
      /\bemerging manager\b/i,
      /\bfirst[- ]time fund\b/i,
      /\bfirst[- ]time GP\b/i,
      /\bnew manager\b/i,
      /\bemerging GP\b/i,
    ],
  },
  {
    tag: "MICROPE",
    points: 12,
    patterns: [/\bmicro[- ]?PE\b/i, /\bcontrol invest/i, /\bmajority\b.*\bcontrol\b/i, /\bcontrol model\b/i],
  },
  {
    tag: "ACQ",
    points: 8,
    patterns: [/\bacquisition[- ]oriented\b/i, /\bM&A focus/i, /\bbuy[- ]?and[- ]?build\b/i, /\bbolt[- ]?on\b/i],
  },
]

export function scoreThesis(
  text: string,
  customKeywords: string[] = [],
): ThesisScore {
  if (!text || !text.length) return { points: 0, matched: [], signalTags: [] }
  const matched: string[] = []
  const signalTags = new Set<string>()
  let bestPoints = 0

  for (const group of THESIS_SIGNAL_GROUPS) {
    if (group.patterns.some((p) => p.test(text))) {
      signalTags.add(group.tag)
      bestPoints = Math.max(bestPoints, group.points)
      // Extract one matched literal for reasons
      for (const p of group.patterns) {
        const m = text.match(p)
        if (m) {
          matched.push(m[0].toLowerCase())
          break
        }
      }
    }
  }

  // Custom thesis keywords contribute via the existing scanThesisSignals fn
  if (customKeywords.length) {
    const r = scanThesisSignals(text, customKeywords)
    if (r.matched.length) {
      matched.push(...r.matched.slice(0, 3))
      bestPoints = Math.max(bestPoints, 8)
    }
  }

  return { points: bestPoints, matched: Array.from(new Set(matched)), signalTags: Array.from(signalTags) }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. CONTACT QUALITY  (+2 to +5)  — applies to individuals only
// ═══════════════════════════════════════════════════════════════════════════

export function scoreContactQuality(
  email: string | null | undefined,
  linkedin: string | null | undefined,
): { points: number; tags: string[]; emailVerified: boolean } {
  let points = 0
  const tags: string[] = []
  const emailVerified = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  if (emailVerified) {
    points += 5
    tags.push("EMAIL")
  }
  if (linkedin && /^https?:\/\//.test(linkedin)) {
    points += 2
    tags.push("LINKEDIN")
  }
  return { points, tags, emailVerified }
}

// ═══════════════════════════════════════════════════════════════════════════
// HNW signal extraction (for angel investors)
// ═══════════════════════════════════════════════════════════════════════════

const HNW_SIGNAL_PATTERNS: { tag: string; pattern: RegExp }[] = [
  { tag: "exit", pattern: /\b(?:sold|exited|acquired by|IPO'?d|public offering)\b/i },
  { tag: "founder", pattern: /\b(?:founder|co-founder|founded)\b/i },
  { tag: "ceo", pattern: /\b(?:CEO|chief executive)\b/i },
  { tag: "chairman", pattern: /\b(?:chairman|chairwoman|board chair)\b/i },
  { tag: "managing_partner", pattern: /\b(?:managing partner|managing director)\b/i },
  { tag: "fo_principal", pattern: /\b(?:family office)\b.*\b(?:principal|head|partner)\b/i },
  { tag: "serial", pattern: /\bserial entrepreneur\b/i },
  { tag: "fortune", pattern: /\bForbes\b|\bFortune\b/ },
]

export function extractHnwSignals(bio: string | null | undefined): string[] {
  if (!bio) return []
  const out = new Set<string>()
  for (const { tag, pattern } of HNW_SIGNAL_PATTERNS) {
    if (pattern.test(bio)) out.add(tag)
  }
  return Array.from(out)
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITE SCORE
// ═══════════════════════════════════════════════════════════════════════════

export interface ComputedScore {
  total: number
  factors: FactorBreakdown
  reasons: string[]
  tags: string[]
  signalTags: string[]
  isAnchor: boolean
  parsedAumUsd: number | null
  emailVerified: boolean
  hnwSignals: string[]
  isSweetSpot: boolean
  /** Each component in [0,1] and the points it contributed (doc 19 §2). */
  components?: LpComponents
  /** Which gates held the score back (doc 19 §6). */
  gates?: string[]
  /** What breaks a tie, in the order doc 19 §7 applies it. */
  rank?: RankKey
  /** The cheque this LP would plausibly write into this fund. */
  expectedTicket?: number | null
}

export interface LpComponents {
  capacity: { value: number; points: number; known: boolean; expectedTicket: number | null }
  lpType: { value: number; points: number; key: LpTypeKey | null }
  thesis: { value: number; points: number; matched: number }
  sector: { value: number; points: number; matched: number }
  geography: { value: number; points: number }
  evidence: { value: number; points: number }
}

export interface RankKey {
  capacityKnown: number
  thesisMatched: number
  sectorMatched: number
  evidence: number
}

export function computeFirmScore(args: {
  type: string | null | undefined
  description: string | null | undefined
  aum: string | null | undefined
  sectors: string[]
  location: string | null | undefined
  fund: FundProfileV2
}): ComputedScore {
  const lp = classifyLpType(args.type, args.description)
  const aum = scoreAum(args.aum)
  const sect = scoreSector(args.sectors, args.fund)
  const geo = scoreGeography(args.location, args.fund)
  const thesisText = [args.description ?? "", args.type ?? "", args.sectors.join(" ")].join(" ")
  const thesis = scoreThesis(thesisText, args.fund.thesisKeywords)
  const capacity = scoreCapacity(aum.parsedUsd, lp.key, raiseBand(args.fund.targetRaise, (args.fund as any).minimumCommitment))

  // Evidence for a firm: do we know enough about it to act? Continuous, so it
  // separates firms that the coarse bands would leave tied (doc 19 §7).
  const evidence = evidenceValue({
    descriptionLength: (args.description ?? "").length,
    sectors: args.sectors.length,
    hasWebsite: !!(args as any).website,
    aumKnown: aum.parsedUsd != null,
  })

  return assemble({
    lp, sect, geo, thesis, capacity, evidence,
    sectorValue: sectorValue(sect.matched.length, args.fund.sectors?.length ?? 0, args.sectors.length),
    weights: LP_WEIGHTS,
    reasons: [
      capacity.reason,
      sect.isSweetSpot ? `Sweet-spot sector fit: ${sect.matched.slice(0, 3).join(", ")}` : sect.matched.length ? `Sector overlap: ${sect.matched.slice(0, 3).join(", ")}` : "",
      geo.points >= 10 ? geo.description : "",
      thesis.matched.length ? `Thesis signals: ${thesis.matched.slice(0, 3).join(", ")}` : "",
    ],
    emailVerified: false,
    hnwSignals: [],
    parsedAumUsd: aum.parsedUsd,
  })
}

/**
 * The weighted sum, the gates and the tie-break key — shared by both sides so
 * a firm and a person are scored on the same scale (doc 19 §2).
 */
function assemble(a: {
  lp: ReturnType<typeof classifyLpType>
  sect: ReturnType<typeof scoreSector>
  geo: ReturnType<typeof scoreGeography>
  thesis: ReturnType<typeof scoreThesis>
  capacity: Capacity
  evidence: number
  /** Continuous sector fit; the banded points stay for tags and reasons. */
  sectorValue?: number
  weights: typeof LP_WEIGHTS | typeof LP_WEIGHTS_NO_CAPACITY
  reasons: string[]
  emailVerified: boolean
  hnwSignals: string[]
  parsedAumUsd: number | null
  extraTags?: string[]
}): ComputedScore {
  const w = a.weights
  const value = {
    capacity: clamp01(a.capacity.value),
    lpType: clamp01(a.lp.points / COMPONENT_MAX.lpType),
    thesis: clamp01(a.thesis.points / COMPONENT_MAX.thesis),
    sector: clamp01(a.sectorValue ?? a.sect.points / COMPONENT_MAX.sector),
    geography: clamp01(a.geo.points / COMPONENT_MAX.geography),
    evidence: clamp01(a.evidence),
  }
  const points = {
    capacity: w.capacity * value.capacity,
    lpType: w.lpType * value.lpType,
    thesis: w.thesis * value.thesis,
    sector: w.sector * value.sector,
    geography: w.geography * value.geography,
    evidence: w.evidence * value.evidence,
  }

  let total = round1(Object.values(points).reduce((x, y) => x + y, 0))
  const gates: string[] = []

  // A cheque this fund cannot take is a demotion, not a disqualification.
  if (a.capacity.gate) { total = demoteOneBand(total); gates.push(a.capacity.gate) }
  // Nor is being in the wrong part of the world. A fund that states where it
  // invests is telling us which LPs it can realistically reach and service; an
  // allocator outside that is a worse prospect than its sector fit suggests, and
  // at 18 points of weight geography alone still could not stop a strong sector
  // match carrying an unreachable LP to the top.
  if (a.geo.outOfFocus) { total = demoteOneBand(total); gates.push("geography_mismatch") }
  // A Champion has to be able to write the cheque, be a recognised allocator,
  // and match on something the fund actually does.
  if (total >= 80 && !(value.capacity >= 0.6 && a.lp.key && (value.thesis > 0 || value.sector > 0))) {
    total = into(total, [80, 100], [70, 79.9])
    gates.push("champion_gate")
  }

  const tags: string[] = []
  if (a.lp.tag) tags.push(a.lp.tag)
  if (a.capacity.isAnchor) tags.push("ANCHOR")
  if (a.geo.tag) tags.push(a.geo.tag)
  if (a.sect.isSweetSpot) tags.push("SWEET")
  for (const t of a.thesis.signalTags) tags.push(t)
  for (const t of a.extraTags ?? []) tags.push(t)

  return {
    total,
    // The breakdown persisted per row stays in points, now on the 0–100 scale.
    factors: {
      lpType: Math.round(points.lpType), aum: Math.round(points.capacity), sector: Math.round(points.sector),
      geography: Math.round(points.geography), thesis: Math.round(points.thesis), contact: Math.round(points.evidence),
    },
    reasons: a.reasons.filter(Boolean),
    tags,
    signalTags: a.thesis.signalTags,
    isAnchor: a.capacity.isAnchor,
    parsedAumUsd: a.parsedAumUsd,
    emailVerified: a.emailVerified,
    hnwSignals: a.hnwSignals,
    isSweetSpot: a.sect.isSweetSpot,
    components: {
      capacity: { value: value.capacity, points: round1(points.capacity), known: a.capacity.known, expectedTicket: a.capacity.expectedTicket },
      lpType: { value: value.lpType, points: round1(points.lpType), key: a.lp.key },
      thesis: { value: value.thesis, points: round1(points.thesis), matched: a.thesis.matched.length },
      sector: { value: value.sector, points: round1(points.sector), matched: a.sect.matched.length },
      geography: { value: value.geography, points: round1(points.geography) },
      evidence: { value: value.evidence, points: round1(points.evidence) },
    },
    gates,
    rank: {
      capacityKnown: a.capacity.known ? 1 : 0,
      thesisMatched: a.thesis.matched.length,
      sectorMatched: a.sect.matched.length,
      evidence: value.evidence,
    },
    expectedTicket: a.capacity.expectedTicket,
  }
}

export function computeContactScore(args: {
  type: string | null | undefined
  bio: string | null | undefined
  email: string | null | undefined
  linkedin: string | null | undefined
  sectors: string[]
  location: string | null | undefined
  title?: string | null
  fund: FundProfileV2
  /** Their firm's capacity, where the firm is known (doc 19 §4). */
  firmCapacity?: Capacity | null
}): ComputedScore {
  let lp = classifyLpType(args.type, args.bio)
  const hnwSignals = extractHnwSignals(args.bio)

  // Angel → HNW upgrade if 2+ signals
  if (!lp.key && /\bangel\b/i.test(args.type ?? "")) {
    if (hnwSignals.length >= 2) {
      lp = { key: "hnw_angel", points: LP_TYPE_POINTS.hnw_angel, tag: "HNW-Angel" }
    }
  }

  const sect = scoreSector(args.sectors, args.fund)
  const geo = scoreGeography(args.location, args.fund)
  const thesis = scoreThesis(args.bio ?? "", args.fund.thesisKeywords)
  const contact = scoreContactQuality(args.email, args.linkedin)

  // A person carries their firm's capacity when we know the firm; otherwise
  // capacity's weight is redistributed rather than scored as zero.
  const capacity: Capacity = args.firmCapacity?.known
    ? args.firmCapacity
    : { value: 0, isAnchor: false, expectedTicket: null, known: false, reason: "", gate: null }
  const weights = capacity.known ? LP_WEIGHTS : LP_WEIGHTS_NO_CAPACITY

  // Seniority is evidence of reaching a decision-maker, not capacity (doc 19 §4).
  const senior = /\b(chief investment officer|cio\b|managing partner|managing director|head of|partner|principal|founder|trustee|treasurer)\b/i.test(args.title ?? "")
  const evidence = clamp01(contact.points / COMPONENT_MAX.evidence * 0.7 + (senior ? 0.3 : 0))

  return assemble({
    lp, sect, geo, thesis, capacity, evidence, weights,
    sectorValue: sectorValue(sect.matched.length, args.fund.sectors?.length ?? 0, args.sectors.length),
    reasons: [
      capacity.known ? capacity.reason : "",
      senior ? `Decision-maker: ${args.title}` : "",
      sect.isSweetSpot ? `Sweet-spot sector fit: ${sect.matched.slice(0, 3).join(", ")}` : sect.matched.length ? `Sectors: ${sect.matched.slice(0, 3).join(", ")}` : "",
      geo.points >= 10 ? geo.description : "",
      thesis.matched.length ? `Bio signals: ${thesis.matched.slice(0, 3).join(", ")}` : "",
      hnwSignals.length >= 2 ? `HNW signals: ${hnwSignals.join(", ")}` : "",
      contact.emailVerified ? "Email on record" : "",
    ],
    emailVerified: contact.emailVerified,
    hnwSignals,
    parsedAumUsd: capacity.known ? null : null,
    extraTags: [...contact.tags, ...(senior ? ["DM"] : [])],
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════
export const MIN_QUALIFICATION_SCORE = 20

// ═══════════════════════════════════════════════════════════════════════════
// Composite model (doc 19 §2)
// ═══════════════════════════════════════════════════════════════════════════

/** Each component scorer's own maximum, for reading its points as a fraction. */
const COMPONENT_MAX = { lpType: 28, sector: 20, geography: 22, thesis: 18, evidence: 7 } as const

/**
 * Weights, summing to 100 (doc 19 §2).
 *
 * Geography went 10 → 18 (2026-09-25). At 10 it could not separate a New York
 * allocator from one in Daejeon for a fund that says "North American" in its
 * first sentence, and the measured top-5 for a $5M North American consumer fund
 * was four university endowments, three of them overseas. The points came off
 * lpType (25 → 20) and thesis (20 → 18): lpType was over-weighted precisely
 * because it rewards "is a big recognisable institution", which is the failure
 * mode being corrected.
 */
export const LP_WEIGHTS = { capacity: 25, lpType: 20, thesis: 18, sector: 14, geography: 18, evidence: 5 } as const

/**
 * Weights for a person whose capacity nothing evidences: capacity's 25 points
 * are spread across what a person does evidence, so the scale still totals 100
 * and a person is not capped below a firm by construction (doc 19 §4).
 *
 * Revised after the first run (doc 19 §4.1). The first split put 30 on thesis,
 * which measured near zero for almost every person: LP bios are not thin —
 * 0 of 1,339 are under 40 characters — they simply do not discuss a fund's
 * thesis. The weight now sits on what a person genuinely evidences: the kind
 * of allocator they work for, and whether they are a reachable decision-maker.
 */
export const LP_WEIGHTS_NO_CAPACITY = { capacity: 0, lpType: 40, thesis: 15, sector: 15, geography: 10, evidence: 20 } as const

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/**
 * How much of the fund's own sector list this LP covers, decayed by how many
 * sectors they claim (doc 11 §4.3 does the same for founders).
 *
 * The banded version returned three values — 20, 15 or 8 — so hundreds of LPs
 * landed on identical scores and ties had to be broken by name. Share and
 * breadth are continuous, which separates them on evidence instead.
 */
export function sectorValue(matched: number, fundSectors: number, lpSectors: number): number {
  if (!fundSectors || !matched) return 0
  const share = Math.min(1, matched / fundSectors)
  const focus = 1 / (1 + 0.1 * Math.max(0, lpSectors - 3))
  return clamp01(share * (0.7 + 0.3 * focus))
}

/**
 * How much is actually known about this record — continuous, so two LPs with
 * the same bands are still separated by how well evidenced they are.
 */
export function evidenceValue(a: { descriptionLength: number; sectors: number; hasWebsite: boolean; aumKnown: boolean }): number {
  const described = Math.min(1, a.descriptionLength / 400)
  const sectors = Math.min(1, a.sectors / 4)
  return clamp01(0.4 * described + 0.25 * sectors + 0.15 * (a.hasWebsite ? 1 : 0) + 0.2 * (a.aumKnown ? 1 : 0))
}
const round1 = (n: number) => Math.round(n * 10) / 10
/** Map a value from one range onto another, preserving order within it. */
const into = (v: number, [a, b]: [number, number], [c, d]: [number, number]) =>
  round1(c + ((v - a) / (b - a || 1)) * (d - c))

/** One tier down, keeping the order inside the band (doc 19 §6). */
export function demoteOneBand(score: number): number {
  if (score >= 80) return into(score, [80, 100], [70, 79.9])
  if (score >= 60) return into(score, [60, 80], [50, 59.9])
  if (score >= 40) return into(score, [40, 60], [30, 39.9])
  return score
}
export const MAX_THEORETICAL_SCORE = 28 + 25 + 20 + 22 + 18 + 5 // = 118

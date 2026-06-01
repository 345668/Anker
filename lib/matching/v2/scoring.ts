/**
 * SVS-aligned scoring functions.
 *
 * Each dimension implements the absolute-points model from
 * SVS_Scoring_Methodology.docx. Pure functions, no I/O. Easy to unit-test.
 *
 * Maximum theoretical score per entity:
 *   LP Type 28 + AUM 25 + Sector 20 + Geography 22 + Thesis 18 + Contact 5 = 118
 *
 * The ≥20 minimum threshold and tier breakpoints (40/60/80) are calibrated
 * against this max.
 */

import { hasSectorOverlap, scanThesisSignals } from "../industry-synonyms"
import type { FactorBreakdown, FundProfileV2 } from "./types"

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

export function detectRegions(location: string | null | undefined): string[] {
  if (!location) return []
  const lower = location.toLowerCase()
  const out = new Set<string>()
  for (const [region, kws] of Object.entries(GEO_REGIONS)) {
    if (kws.some((k) => lower.includes(k))) out.add(region)
  }
  return Array.from(out)
}

export function scoreGeography(
  location: string | null | undefined,
  fund: FundProfileV2,
): { points: number; tag: string | null; description: string } {
  if (!location) return { points: 0, tag: null, description: "No location data" }
  const regions = detectRegions(location)
  if (!regions.length) return { points: 1, tag: null, description: `Unrecognized: ${location}` }

  const hqRegions = detectRegions(fund.headquartersLocation)
  const focusRegions = new Set(fund.geographicFocus.map((g) => g.toLowerCase()))

  // Local match → fund HQ shares a non-generic region with entity
  for (const r of hqRegions) {
    if (["utah", "mountain_west", "dach", "gulf", "italy", "uk", "france", "canada", "india", "singapore", "japan", "china"].includes(r) && regions.includes(r)) {
      return { points: 22, tag: "LOCAL", description: `Local: ${location}` }
    }
  }

  // Mountain West halo when fund is in Utah
  if (hqRegions.includes("utah") && regions.includes("mountain_west")) {
    return { points: 15, tag: "MTN-WEST", description: `Mountain West: ${location}` }
  }

  // US (other) — fund is US-based and entity is in US
  if (regions.includes("us") || regions.includes("us_east") || regions.includes("us_west")) {
    if (hqRegions.some((r) => ["utah", "mountain_west", "us", "us_east", "us_west"].includes(r))) {
      return { points: 10, tag: "US", description: `US: ${location}` }
    }
  }

  // Gulf / Canada
  if (regions.includes("gulf") || regions.includes("canada")) {
    return { points: 6, tag: regions.includes("gulf") ? "GULF" : "CANADA", description: `${location}` }
  }
  // DACH / Italy
  if (regions.includes("dach")) return { points: 5, tag: "DACH", description: location }
  if (regions.includes("italy")) return { points: 5, tag: "ITALY", description: location }
  // UK
  if (regions.includes("uk")) return { points: 4, tag: "UK", description: location }
  // Other intl
  return { points: 1, tag: "INTL", description: `International: ${location}` }
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

  const factors: FactorBreakdown = {
    lpType: lp.points,
    aum: aum.points,
    sector: sect.points,
    geography: geo.points,
    thesis: thesis.points,
    contact: 0,
  }
  const total = factors.lpType + factors.aum + factors.sector + factors.geography + factors.thesis

  const reasons: string[] = []
  if (aum.parsedUsd) reasons.push(aum.description)
  if (sect.isSweetSpot) reasons.push(`Sweet-spot sector fit: ${sect.matched.slice(0, 3).join(", ")}`)
  else if (sect.matched.length) reasons.push(`Sector overlap: ${sect.matched.slice(0, 3).join(", ")}`)
  if (geo.points >= 10) reasons.push(geo.description)
  if (thesis.matched.length) reasons.push(`Thesis signals: ${thesis.matched.slice(0, 3).join(", ")}`)

  const tags: string[] = []
  if (lp.tag) tags.push(lp.tag)
  if (aum.isAnchor) tags.push("ANCHOR")
  if (geo.tag) tags.push(geo.tag)
  if (sect.isSweetSpot) tags.push("SWEET")
  for (const t of thesis.signalTags) tags.push(t)

  return {
    total,
    factors,
    reasons,
    tags,
    signalTags: thesis.signalTags,
    isAnchor: aum.isAnchor,
    parsedAumUsd: aum.parsedUsd,
    emailVerified: false,
    hnwSignals: [],
    isSweetSpot: sect.isSweetSpot,
  }
}

export function computeContactScore(args: {
  type: string | null | undefined
  bio: string | null | undefined
  email: string | null | undefined
  linkedin: string | null | undefined
  sectors: string[]
  location: string | null | undefined
  fund: FundProfileV2
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

  const factors: FactorBreakdown = {
    lpType: lp.points,
    aum: 0,
    sector: sect.points,
    geography: geo.points,
    thesis: thesis.points,
    contact: contact.points,
  }
  const total = factors.lpType + factors.sector + factors.geography + factors.thesis + factors.contact

  const reasons: string[] = []
  if (sect.isSweetSpot) reasons.push(`Sweet-spot sector fit: ${sect.matched.slice(0, 3).join(", ")}`)
  else if (sect.matched.length) reasons.push(`Sectors: ${sect.matched.slice(0, 3).join(", ")}`)
  if (geo.points >= 10) reasons.push(geo.description)
  if (thesis.matched.length) reasons.push(`Bio signals: ${thesis.matched.slice(0, 3).join(", ")}`)
  if (hnwSignals.length >= 2) reasons.push(`HNW signals: ${hnwSignals.join(", ")}`)
  if (contact.emailVerified) reasons.push("Verified email")

  const tags: string[] = []
  if (lp.tag) tags.push(lp.tag)
  if (geo.tag) tags.push(geo.tag)
  if (sect.isSweetSpot) tags.push("SWEET")
  for (const t of contact.tags) tags.push(t)
  for (const t of thesis.signalTags) tags.push(t)

  return {
    total,
    factors,
    reasons,
    tags,
    signalTags: thesis.signalTags,
    isAnchor: false,
    parsedAumUsd: null,
    emailVerified: contact.emailVerified,
    hnwSignals,
    isSweetSpot: sect.isSweetSpot,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════
export const MIN_QUALIFICATION_SCORE = 20
export const MAX_THEORETICAL_SCORE = 28 + 25 + 20 + 22 + 18 + 5 // = 118

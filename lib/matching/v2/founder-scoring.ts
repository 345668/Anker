/**
 * Founder-side scoring (Startup → Investor) using the same SVS-aligned
 * absolute-points pattern as the LP engine.
 *
 *   Sector       +8-25     (sector overlap, weighted higher than LP-side)
 *   Stage        +10-25    (does the investor invest at this stage?)
 *   Check Size   +5-20     (does their typical check fit the round?)
 *   Geography    +1-15     (local/regional/international)
 *   Investor type +5-15    (VC > angel-with-track-record > etc.)
 *   Thesis       +5-15     (thesis signals + portfolio velocity)
 *   Contact      +2-3      (persons only — verified email/LinkedIn)
 *
 * Max ≈ 118 points. Min qualification ≥ 20.
 */

import { hasSectorOverlap, scanThesisSignals } from "../industry-synonyms"
import { detectRegions } from "./scoring"
import type { FounderFactorBreakdown, StartupProfile, StartupStage } from "./founder-types"

// ─── 1. SECTOR  (+8 to +25) ────────────────────────────────────────────────
export function scoreSectorFit(
  investorSectors: string[],
  startup: StartupProfile,
): { points: number; matched: string[]; isPrimary: boolean } {
  if (!investorSectors.length || !startup.sectors.length) {
    return { points: 0, matched: [], isPrimary: false }
  }
  const overlap = hasSectorOverlap(investorSectors, startup.sectors)
  if (!overlap.overlap) return { points: 0, matched: [], isPrimary: false }

  const isPrimary =
    !!startup.primarySector &&
    overlap.matched.some((m) => m.toLowerCase().includes(startup.primarySector!.toLowerCase()))

  if (isPrimary) return { points: 25, matched: overlap.matched, isPrimary: true }
  if (overlap.matched.length >= 3) return { points: 18, matched: overlap.matched, isPrimary: false }
  return { points: 8, matched: overlap.matched, isPrimary: false }
}

// ─── 2. STAGE  (+10 to +25) ────────────────────────────────────────────────
const STAGE_ORDER: StartupStage[] = [
  "pre-seed", "seed", "series-a", "series-b", "series-c", "growth", "late-stage",
]

const STAGE_SYNONYMS: Record<string, StartupStage[]> = {
  "pre-seed": ["pre-seed"],
  "preseed": ["pre-seed"],
  "seed": ["seed"],
  "series a": ["series-a"],
  "series-a": ["series-a"],
  "series b": ["series-b"],
  "series-b": ["series-b"],
  "series c": ["series-c"],
  "series-c": ["series-c"],
  "growth": ["growth"],
  "late stage": ["late-stage"],
  "late-stage": ["late-stage"],
}

function normalizeInvestorStages(raw: unknown): StartupStage[] {
  if (!raw) return []
  let arr: any[] = []
  if (Array.isArray(raw)) arr = raw
  else if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw)
      arr = Array.isArray(p) ? p : raw.split(",")
    } catch {
      arr = raw.split(",")
    }
  }
  const out = new Set<StartupStage>()
  for (const item of arr) {
    if (typeof item !== "string") continue
    const k = item.toLowerCase().trim()
    const matches = STAGE_SYNONYMS[k]
    if (matches) matches.forEach((s) => out.add(s))
  }
  return Array.from(out)
}

export function scoreStageFit(
  investorStagesRaw: unknown,
  startupStage: StartupStage,
): { points: number; description: string; matched: boolean; adjacent: boolean } {
  const stages = normalizeInvestorStages(investorStagesRaw)
  if (!stages.length) return { points: 0, description: "Stage unknown", matched: false, adjacent: false }
  if (stages.includes(startupStage)) {
    return { points: 25, description: `Invests at ${startupStage}`, matched: true, adjacent: false }
  }
  // Adjacent stage: ±1 in the order list
  const idx = STAGE_ORDER.indexOf(startupStage)
  const adjacent = stages.some((s) => Math.abs(STAGE_ORDER.indexOf(s) - idx) === 1)
  if (adjacent) {
    return { points: 12, description: `Adjacent stage`, matched: false, adjacent: true }
  }
  return { points: 0, description: `Stage mismatch`, matched: false, adjacent: false }
}

// ─── 3. CHECK SIZE  (+5 to +20) ────────────────────────────────────────────
export function scoreCheckSize(
  investorMin: number | null | undefined,
  investorMax: number | null | undefined,
  startupCheckIdeal: { min: number | null; max: number | null },
  ask: number | null,
): { points: number; description: string; canLead: boolean } {
  const iMin = numberOrNull(investorMin)
  const iMax = numberOrNull(investorMax)
  const sMin = numberOrNull(startupCheckIdeal.min) ?? (ask ? Math.round(ask * 0.15) : null)
  const sMax = numberOrNull(startupCheckIdeal.max) ?? ask

  if (!iMin && !iMax) return { points: 0, description: "Check size unknown", canLead: false }

  // Investor's effective range
  const lo = iMin ?? 0
  const hi = iMax ?? Number.POSITIVE_INFINITY

  // Lead candidate: investor's max can cover the startup's ideal max
  const canLead = !!sMax && hi >= sMax * 0.8

  // Strong fit: investor range substantially overlaps startup range
  if (sMin && sMax && hi >= sMin && lo <= sMax) {
    if (canLead) return { points: 20, description: `Check fits round (lead capacity)`, canLead: true }
    return { points: 15, description: `Check fits round (follow-on)`, canLead: false }
  }
  // Smaller-than-ideal but in ballpark
  if (sMin && hi >= sMin * 0.5 && hi <= sMin) {
    return { points: 8, description: `Below ideal range (follow-on)`, canLead: false }
  }
  // Larger investor than typical (could anchor)
  if (sMax && lo > sMax) {
    return { points: 10, description: `Investor typically larger checks`, canLead: false }
  }
  return { points: 5, description: "Adjacent check size", canLead: false }
}

function numberOrNull(v: any): number | null {
  if (v == null) return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

// ─── 4. GEOGRAPHY  (+1 to +15) ─────────────────────────────────────────────
export function scoreGeoFit(
  investorLocation: string | null | undefined,
  startup: StartupProfile,
): { points: number; tag: string | null; description: string } {
  if (!investorLocation) return { points: 0, tag: null, description: "Location unknown" }
  const invRegions = detectRegions(investorLocation)
  const startupRegions = detectRegions(startup.location)
  const targetRegions = (startup.geographyTargetRegions ?? []).map((g) => g.toLowerCase())

  if (!invRegions.length) return { points: 1, tag: null, description: `Unrecognized: ${investorLocation}` }

  // Local: shares a non-generic region with founder
  for (const r of startupRegions) {
    if (
      ["utah", "mountain_west", "us_west", "us_east", "dach", "gulf", "italy", "uk", "france", "canada", "india", "singapore", "japan", "china"].includes(r) &&
      invRegions.includes(r)
    ) {
      return { points: 15, tag: "LOCAL", description: `Local: ${investorLocation}` }
    }
  }

  // Same country (US umbrella)
  if (invRegions.some((r) => ["us", "us_east", "us_west"].includes(r)) &&
      startupRegions.some((r) => ["us", "us_east", "us_west", "utah", "mountain_west"].includes(r))) {
    return { points: 10, tag: "US", description: `US: ${investorLocation}` }
  }

  // Founder explicitly targeted this region
  if (invRegions.some((r) => targetRegions.includes(r))) {
    return { points: 8, tag: "TARGET", description: `Target region: ${investorLocation}` }
  }

  // International
  if (invRegions.some((r) => ["dach", "gulf", "italy", "uk", "france", "canada", "india", "singapore", "japan", "china"].includes(r))) {
    return { points: 4, tag: "INTL", description: `International: ${investorLocation}` }
  }

  return { points: 1, tag: null, description: investorLocation }
}

// ─── 5. INVESTOR TYPE  (+5 to +15) ─────────────────────────────────────────
export function scoreInvestorType(
  type: string | null | undefined,
  portfolioCount?: number | null,
): { points: number; tag: string; description: string } {
  if (!type) return { points: 0, tag: "Unknown", description: "" }
  const lower = type.toLowerCase()

  if (/\bventure capital\b|\bVC\b|\bvc\b/.test(lower)) {
    const pts = portfolioCount && portfolioCount >= 20 ? 15 : 12
    return { points: pts, tag: "VC", description: `VC${portfolioCount ? ` (${portfolioCount} portfolio cos)` : ""}` }
  }
  if (/\bcorporate venture\b|\bCVC\b/.test(lower)) {
    return { points: 10, tag: "CVC", description: "Corporate VC" }
  }
  if (/\bfamily office\b/.test(lower)) {
    return { points: 8, tag: "FO", description: "Family Office" }
  }
  if (/\baccelerator\b|\bincubator\b/.test(lower)) {
    return { points: 6, tag: "ACCEL", description: "Accelerator/Incubator" }
  }
  if (/\bangel\b/.test(lower)) {
    const pts = portfolioCount && portfolioCount >= 10 ? 10 : 6
    return { points: pts, tag: "ANGEL", description: `Angel${portfolioCount ? ` (${portfolioCount} cos)` : ""}` }
  }
  return { points: 5, tag: "Other", description: type }
}

// ─── 6. THESIS SIGNALS  (+5 to +15) ────────────────────────────────────────
export function scoreThesisFit(
  text: string,
  startup: StartupProfile,
): { points: number; matched: string[] } {
  if (!text) return { points: 0, matched: [] }
  const customMatches = startup.thesisKeywords?.length
    ? scanThesisSignals(text, startup.thesisKeywords)
    : { score: 0, matched: [] }
  // Boost if investor mentions startup's primary sector explicitly
  let boost = 0
  if (startup.primarySector && text.toLowerCase().includes(startup.primarySector.toLowerCase())) {
    boost += 5
  }
  // Boost if mentions 'lead investor' or 'first check'
  if (/\blead investor\b|\bfirst check\b|\bwrite the lead\b/i.test(text)) boost += 3
  const score = Math.min(15, customMatches.matched.length * 4 + boost)
  return { points: score, matched: customMatches.matched.slice(0, 3) }
}

// ─── 7. CONTACT QUALITY  (+2 to +3) — persons only ─────────────────────────
export function scoreContactQuality(email?: string | null, linkedin?: string | null): {
  points: number
  emailVerified: boolean
  tags: string[]
} {
  const tags: string[] = []
  let pts = 0
  const emailVerified = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  if (emailVerified) {
    pts += 3
    tags.push("EMAIL")
  }
  if (linkedin && /^https?:\/\//.test(linkedin)) {
    pts += 2
    tags.push("LINKEDIN")
  }
  return { points: Math.min(3, pts), emailVerified, tags } // cap at 3 (matches doc envelope)
}

// ─── COMPOSITE SCORE ───────────────────────────────────────────────────────
export interface FounderComputedScore {
  total: number
  factors: FounderFactorBreakdown
  reasons: string[]
  tags: string[]
  canLead: boolean
  emailVerified: boolean
}

export function computeFirmScoreForStartup(args: {
  type: string | null | undefined
  description: string | null | undefined
  sectors: string[]
  location: string | null | undefined
  stages: unknown
  checkSizeMin: number | null | undefined
  checkSizeMax: number | null | undefined
  portfolioCount: number | null | undefined
  startup: StartupProfile
}): FounderComputedScore {
  const sect = scoreSectorFit(args.sectors, args.startup)
  const stage = scoreStageFit(args.stages, args.startup.stage)
  const check = scoreCheckSize(args.checkSizeMin, args.checkSizeMax, {
    min: args.startup.checkSizeIdealMin,
    max: args.startup.checkSizeIdealMax,
  }, args.startup.askAmount)
  const geo = scoreGeoFit(args.location, args.startup)
  const itype = scoreInvestorType(args.type, args.portfolioCount)
  const thesisText = [args.description ?? "", args.type ?? "", args.sectors.join(" ")].join(" ")
  const thesis = scoreThesisFit(thesisText, args.startup)

  const factors: FounderFactorBreakdown = {
    sector: sect.points,
    stage: stage.points,
    checkSize: check.points,
    geography: geo.points,
    investorType: itype.points,
    thesis: thesis.points,
    contact: 0,
  }
  const total =
    factors.sector + factors.stage + factors.checkSize + factors.geography +
    factors.investorType + factors.thesis

  const reasons: string[] = []
  if (sect.isPrimary) reasons.push(`Primary sector match: ${sect.matched.slice(0, 2).join(", ")}`)
  else if (sect.matched.length) reasons.push(`Sector overlap: ${sect.matched.slice(0, 3).join(", ")}`)
  if (stage.matched) reasons.push(stage.description)
  else if (stage.adjacent) reasons.push(stage.description)
  if (check.canLead) reasons.push(`${check.description}`)
  else if (check.points >= 8) reasons.push(check.description)
  if (geo.points >= 8) reasons.push(geo.description)
  if (itype.points >= 10) reasons.push(itype.description)
  if (thesis.matched.length) reasons.push(`Thesis signals: ${thesis.matched.slice(0, 2).join(", ")}`)

  const tags: string[] = []
  if (itype.tag) tags.push(itype.tag)
  if (sect.isPrimary) tags.push("PRIMARY")
  if (stage.matched) tags.push("STAGE")
  if (check.canLead) tags.push("LEAD")
  if (geo.tag) tags.push(geo.tag)

  return { total, factors, reasons, tags, canLead: check.canLead, emailVerified: false }
}

export function computeContactScoreForStartup(args: {
  type: string | null | undefined
  bio: string | null | undefined
  email: string | null | undefined
  linkedin: string | null | undefined
  sectors: string[]
  location: string | null | undefined
  stages: unknown
  checkSizeMin: number | null | undefined
  checkSizeMax: number | null | undefined
  portfolioCount: number | null | undefined
  startup: StartupProfile
}): FounderComputedScore {
  const sect = scoreSectorFit(args.sectors, args.startup)
  const stage = scoreStageFit(args.stages, args.startup.stage)
  const check = scoreCheckSize(args.checkSizeMin, args.checkSizeMax, {
    min: args.startup.checkSizeIdealMin,
    max: args.startup.checkSizeIdealMax,
  }, args.startup.askAmount)
  const geo = scoreGeoFit(args.location, args.startup)
  const itype = scoreInvestorType(args.type, args.portfolioCount)
  const thesis = scoreThesisFit(args.bio ?? "", args.startup)
  const contact = scoreContactQuality(args.email, args.linkedin)

  const factors: FounderFactorBreakdown = {
    sector: sect.points,
    stage: stage.points,
    checkSize: check.points,
    geography: geo.points,
    investorType: itype.points,
    thesis: thesis.points,
    contact: contact.points,
  }
  const total =
    factors.sector + factors.stage + factors.checkSize + factors.geography +
    factors.investorType + factors.thesis + factors.contact

  const reasons: string[] = []
  if (sect.isPrimary) reasons.push(`Primary sector match: ${sect.matched.slice(0, 2).join(", ")}`)
  else if (sect.matched.length) reasons.push(`Sectors: ${sect.matched.slice(0, 3).join(", ")}`)
  if (stage.matched) reasons.push(stage.description)
  if (check.canLead) reasons.push(check.description)
  if (geo.points >= 8) reasons.push(geo.description)
  if (thesis.matched.length) reasons.push(`Bio signals: ${thesis.matched.slice(0, 2).join(", ")}`)
  if (contact.emailVerified) reasons.push("Verified email")

  const tags: string[] = []
  if (itype.tag) tags.push(itype.tag)
  if (sect.isPrimary) tags.push("PRIMARY")
  if (stage.matched) tags.push("STAGE")
  if (check.canLead) tags.push("LEAD")
  if (geo.tag) tags.push(geo.tag)
  for (const t of contact.tags) tags.push(t)

  return { total, factors, reasons, tags, canLead: check.canLead, emailVerified: contact.emailVerified }
}

export const FOUNDER_MIN_SCORE = 20
export const FOUNDER_MAX_SCORE = 25 + 25 + 20 + 15 + 15 + 15 + 3 // = 118

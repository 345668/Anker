/**
 * Founder-side LP matchmaking engine — Startup → Investor.
 *
 * Mirrors the LP v2 engine architecture: SQL pre-load, score, dedup,
 * segment, AI rationales, funnel + summary stats.
 */

import { sql } from "@/lib/db"
import { dedupContacts, dedupFirms } from "./dedup"
import {
  computeContactScoreForStartup,
  computeFirmScoreForStartup,
  FOUNDER_MIN_SCORE,
} from "./founder-scoring"
import { semanticScoresFor } from "./semantic"
import {
  classifyContactSegments as _ignoredA,
  classifyFirmSegments as _ignoredB,
} from "./segmentation"
import {
  FounderFunnel,
  FounderMatchingResult,
  INVESTOR_SEGMENTS,
  InvestorSegment,
  ScoredInvestorEntity,
  StartupProfile,
} from "./founder-types"
import { TIER_DEFINITIONS, TierId, tierFor } from "./types"

// silence unused import warnings (keep references for future expansion)
void _ignoredA; void _ignoredB

interface RunOptions {
  minScore?: number
  maxFirms?: number
  maxContacts?: number
}

export async function runFounderMatching(
  startup: StartupProfile,
  options: RunOptions = {},
): Promise<FounderMatchingResult> {
  const startTime = Date.now()
  const minScore = options.minScore ?? FOUNDER_MIN_SCORE
  const maxFirms = options.maxFirms ?? 10000
  const maxContacts = options.maxContacts ?? 10000

  // ─── Load ────────────────────────────────────────────────────────────────
  const allFirms = await sql`
    SELECT id, name, COALESCE(firm_classification, type) AS type,
           description, sectors, stages,
           COALESCE(hq_location, location) AS location,
           website, linkedin_url, check_size_min, check_size_max,
           portfolio_count
    FROM investment_firms
  `
  const allInvestors = await sql`
    SELECT id, first_name, last_name, investor_type AS type,
           bio, sectors, location, email, firm_id,
           COALESCE(linkedin_url, person_linkedin_url) AS linkedin,
           title, stages, typical_check_size, num_lead_investments,
           total_investments
    FROM investors
  `

  // ─── Semantic layer (optional; graceful no-op without embeddings) ────────
  // Embed the startup once and resolve cosine similarity to the pre-embedded
  // firm/investor theses. Empty maps → 0 semantic points → structured-only.
  const semantic = await semanticScoresFor(startup)

  // ─── Score firms ────────────────────────────────────────────────────────
  let firms: any[] = []
  for (const f of allFirms) {
    const sectors = toStringArray((f as any).sectors)
    const r = computeFirmScoreForStartup({
      type: (f as any).type,
      description: (f as any).description,
      sectors,
      location: (f as any).location,
      stages: (f as any).stages,
      checkSizeMin: numOrNull((f as any).check_size_min),
      checkSizeMax: numOrNull((f as any).check_size_max),
      portfolioCount: numOrNull((f as any).portfolio_count),
      startup,
      semanticScore: semantic.firms.get(String((f as any).id)),
    })
    if (r.total < minScore) continue
    firms.push({
      id: (f as any).id,
      kind: "firm" as const,
      name: (f as any).name ?? "",
      normalizedName: ((f as any).name ?? "").toLowerCase(),
      type: (f as any).type ?? "",
      location: (f as any).location ?? "",
      sectors,
      website: (f as any).website ?? null,
      linkedin: (f as any).linkedin_url ?? null,
      description: (f as any).description ?? null,
      checkSizeMin: numOrNull((f as any).check_size_min),
      checkSizeMax: numOrNull((f as any).check_size_max),
      portfolioCount: numOrNull((f as any).portfolio_count),
      stages: toStringArray((f as any).stages),
      score: r.total,
      tier: tierFor(r.total),
      factors: r.factors,
      reasons: r.reasons,
      whyMatch: ruleBasedWhy(r.reasons, r.tags),
      tags: r.tags,
      segments: [] as InvestorSegment[],
      stage: "identified" as const,
      isAnchor: r.canLead,
      // dedup compat
      aumRaw: null,
      aumUsd: null,
      firmId: (f as any).id,
    })
  }

  // ─── Score contacts ─────────────────────────────────────────────────────
  let contacts: any[] = []
  for (const inv of allInvestors) {
    const sectors = toStringArray((inv as any).sectors)
    const r = computeContactScoreForStartup({
      type: (inv as any).type,
      bio: (inv as any).bio,
      email: (inv as any).email,
      linkedin: (inv as any).linkedin,
      sectors,
      location: (inv as any).location,
      stages: (inv as any).stages,
      checkSizeMin: parseCheckRange((inv as any).typical_check_size).min,
      checkSizeMax: parseCheckRange((inv as any).typical_check_size).max,
      portfolioCount: numOrNull((inv as any).total_investments),
      startup,
      semanticScore: semantic.contacts.get(String((inv as any).id)),
    })
    if (r.total < minScore) continue
    contacts.push({
      id: (inv as any).id,
      investorId: (inv as any).id,
      kind: "person" as const,
      name: `${(inv as any).first_name ?? ""} ${(inv as any).last_name ?? ""}`.trim(),
      title: (inv as any).title ?? null,
      type: (inv as any).type ?? "",
      location: (inv as any).location ?? "",
      sectors,
      email: (inv as any).email ?? null,
      emailVerified: r.emailVerified,
      linkedin: (inv as any).linkedin ?? null,
      bio: (inv as any).bio ?? null,
      firmId: (inv as any).firm_id ?? null,
      website: null,
      score: r.total,
      tier: tierFor(r.total),
      factors: r.factors,
      reasons: r.reasons,
      whyMatch: ruleBasedWhy(r.reasons, r.tags),
      tags: r.tags,
      segments: [] as InvestorSegment[],
      stage: "identified" as const,
      isHnwAngel: false,
      hnwSignals: [],
    })
  }

  // ─── Dedup ──────────────────────────────────────────────────────────────
  const beforeF = firms.length
  const beforeC = contacts.length
  const dedupF = dedupFirms(firms as any)
  const dedupC = dedupContacts(contacts as any)
  firms = dedupF.merged as any
  contacts = dedupC.merged as any
  const duplicatesMerged = dedupF.mergedCount + dedupC.mergedCount

  firms.sort((a: any, b: any) => b.score - a.score)
  contacts.sort((a: any, b: any) => b.score - a.score)
  firms = firms.slice(0, maxFirms)
  contacts = contacts.slice(0, maxContacts)

  // ─── Segments ───────────────────────────────────────────────────────────
  for (const f of firms) f.segments = classifyInvestorSegments(f, startup)
  for (const c of contacts) c.segments = classifyInvestorSegments(c, startup)

  // ─── Stats + funnel ─────────────────────────────────────────────────────
  const contactsWithEmail = contacts.filter((c: any) => c.emailVerified).length
  const leadCandidates = firms.filter((f: any) => f.tags.includes("LEAD")).length

  const tierCounts = {
    firms: emptyTierCounts(),
    contacts: emptyTierCounts(),
  }
  for (const f of firms) tierCounts.firms[(f as any).tier as TierId]++
  for (const c of contacts) tierCounts.contacts[(c as any).tier as TierId]++

  const segmentCounts = {
    firms: emptySegmentCounts(),
    contacts: emptySegmentCounts(),
  }
  for (const f of firms) for (const s of (f as any).segments) segmentCounts.firms[s as InvestorSegment]++
  for (const c of contacts) for (const s of (c as any).segments) segmentCounts.contacts[s as InvestorSegment]++

  const funnel: FounderFunnel = {
    firms: [
      { label: "Raw database", count: allFirms.length, pct: 100 },
      { label: "Pre-dedup qualified", count: beforeF, pct: pct(beforeF, allFirms.length) },
      {
        label: `Qualified (≥ ${minScore})`,
        count: firms.length,
        pct: pct(firms.length, allFirms.length),
        notes: dedupF.mergedCount ? `${dedupF.mergedCount} duplicates merged` : undefined,
      },
      { label: "Lead candidates", count: leadCandidates, pct: pct(leadCandidates, allFirms.length) },
      {
        label: "Local",
        count: firms.filter((f: any) => f.tags.includes("LOCAL")).length,
        pct: pct(firms.filter((f: any) => f.tags.includes("LOCAL")).length, allFirms.length),
      },
    ],
    contacts: [
      { label: "Raw database", count: allInvestors.length, pct: 100 },
      { label: "Pre-dedup qualified", count: beforeC, pct: pct(beforeC, allInvestors.length) },
      {
        label: `Qualified (≥ ${minScore})`,
        count: contacts.length,
        pct: pct(contacts.length, allInvestors.length),
        notes: dedupC.mergedCount ? `${dedupC.mergedCount} duplicates merged` : undefined,
      },
      {
        label: "With verified email",
        count: contactsWithEmail,
        pct: pct(contactsWithEmail, allInvestors.length),
      },
    ],
  }

  const sessionId = `fms_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  return {
    sessionId,
    startupProfileId: startup.id,
    startupName: startup.name,
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    funnel,
    totals: {
      rawFirms: allFirms.length,
      rawContacts: allInvestors.length,
      qualifiedFirms: firms.length,
      qualifiedContacts: contacts.length,
      contactsWithEmail,
      leadCandidates,
      duplicatesMerged,
      aiEnrichmentsApplied: 0,
    },
    tierCounts,
    segmentCounts,
    firms: firms as (ScoredInvestorEntity & { segments: InvestorSegment[] })[],
    contacts: contacts as (ScoredInvestorEntity & { segments: InvestorSegment[] })[],
  }
}

// ─── Segmentation ──────────────────────────────────────────────────────────
function classifyInvestorSegments(
  e: any,
  _startup: StartupProfile,
): InvestorSegment[] {
  const out = new Set<InvestorSegment>()
  const tags: string[] = e.tags ?? []
  if (tags.includes("LOCAL") && tags.includes("PRIMARY")) out.add("warm_local")
  else if (tags.includes("LOCAL")) out.add("warm_local")
  if (tags.includes("LEAD") && tags.includes("STAGE")) out.add("lead")
  else if (tags.includes("LEAD")) out.add("lead")
  else if (tags.includes("STAGE")) out.add("stage_match")
  if (tags.includes("PRIMARY") && !out.has("lead")) out.add("sector_match")
  if (e.portfolioCount && e.portfolioCount >= 30) out.add("active_recent")
  if (tags.includes("INTL")) out.add("international")
  // Follow-on: stage match but check size below ideal
  if (tags.includes("STAGE") && !tags.includes("LEAD") && (e.factors?.checkSize ?? 0) >= 8) {
    out.add("follow_on")
  }
  return Array.from(out)
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function pct(n: number, d: number): number {
  if (!d) return 0
  return Math.round((n / d) * 1000) / 10
}
function emptyTierCounts(): Record<TierId, number> {
  return TIER_DEFINITIONS.reduce(
    (acc, t) => ({ ...acc, [t.id]: 0 }),
    {} as Record<TierId, number>,
  )
}
function emptySegmentCounts(): Record<InvestorSegment, number> {
  return INVESTOR_SEGMENTS.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<InvestorSegment, number>,
  )
}
function numOrNull(v: any): number | null {
  if (v == null) return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string")
  if (typeof v === "string" && v.length) {
    try {
      const p = JSON.parse(v)
      if (Array.isArray(p)) return p.filter((x): x is string => typeof x === "string")
    } catch {}
    return v.split(",").map((s) => s.trim()).filter(Boolean)
  }
  return []
}
function parseCheckRange(s: any): { min: number | null; max: number | null } {
  if (!s) return { min: null, max: null }
  const str = String(s)
  const m = str.match(/\$?(\d+(?:\.\d+)?)\s*([KMB]?)\s*(?:[-–—to]\s*\$?(\d+(?:\.\d+)?)\s*([KMB]?))?/i)
  if (!m) return { min: null, max: null }
  const scale = (n: string, u: string) => {
    const v = parseFloat(n)
    if (!Number.isFinite(v)) return null
    const ul = u.toUpperCase()
    if (ul === "K") return v * 1_000
    if (ul === "M") return v * 1_000_000
    if (ul === "B") return v * 1_000_000_000
    return v
  }
  const min = scale(m[1], m[2] ?? "")
  const max = m[3] ? scale(m[3], m[4] ?? m[2] ?? "") : min
  return { min, max }
}
function ruleBasedWhy(reasons: string[], tags: string[]): string {
  const bits: string[] = []
  if (tags.includes("LEAD") && tags.includes("STAGE")) bits.push("lead-check capacity at stage")
  else if (tags.includes("LEAD")) bits.push("lead-check capacity")
  else if (tags.includes("STAGE")) bits.push("stage match")
  if (tags.includes("PRIMARY")) bits.push("primary-sector fit")
  if (tags.includes("LOCAL")) bits.push("local")
  if (!bits.length && reasons.length) return capitalize(reasons.slice(0, 2).join("; ")) + "."
  if (!bits.length) return "Sector overlap."
  return capitalize(bits.join("; ")) + "."
}
function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

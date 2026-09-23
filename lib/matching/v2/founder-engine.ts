/**
 * Founder → investor matching engine, v3 (docs/architecture/11, 14 §5).
 *
 *   load → exclude → semantic → score (v3) → group by firm → rank → cap
 *        → verify emails → AI rationales
 *
 * Persisting the run is the caller's job (lib/matching/v2/founder-runs.ts),
 * so the engine stays callable from tests and the campaign orchestrator
 * without a workspace.
 */
import { sql } from "@/lib/db"
import { semanticScoresFor, calibrate } from "./semantic"
import { enrichInvestorsWithRationales } from "./founder-ai-enrichment"
import {
  ENGINE_VERSION, FOUNDER_MIN_SCORE, firmFacts, personFacts, scoreInvestor, startupContext,
  type V3Score,
} from "./founder-scoring"
import { groupByFirm, compareRanked, chooseContacts, contactRank, type Scored } from "./founder-grouping"
import { seniority, investorClass } from "../normalize/classes"
import { normPhrase } from "../normalize/text"
import { cachedVerifications, verifyEmails } from "@/lib/email-verification/service"
import { isSendable, normEmail } from "@/lib/email-verification/types"
import {
  FounderFunnel, FounderMatchingResult, INVESTOR_SEGMENTS, InvestorSegment, StartupProfile,
} from "./founder-types"
import { TIER_DEFINITIONS, TierId } from "./types"
import { activeWeights } from "./ranker"

export interface RunOptions {
  minScore?: number
  /** Firm groups kept after ranking (default 10,000). */
  maxFirms?: number
  /** Independent investors kept after ranking (default 10,000). */
  maxContacts?: number
  /** Model-written rationales for the top results (default on when a provider is configured). */
  enableAi?: boolean
  /** The workspace the run is for: turns on CRM, suppression and saved exclusions. */
  scope?: { orgId: string; userId: string }
  /** Verify the top groups' contacts (stage 1 always; stage 2 within budget). Default true. */
  verifyEmails?: boolean
  /** How many top groups get their contacts verified before choosing a primary. Default 200. */
  verifyTopGroups?: number
}

type Row = Record<string, any>

async function loadDirectory() {
  const firms = await sql`
    SELECT id::text AS id, name, firm_classification, type, description, sectors, industry, stages,
           hq_location, location, website, linkedin_url, check_size_min, check_size_max, check_min, check_max,
           portfolio_count, norm_class, aum, last_investment_at, last_investment_note, activity_source_url, activity_checked_at
      FROM investment_firms`
  const people = await sql`
    SELECT id::text AS id, first_name, last_name, investor_type, left(bio, 1500) AS bio, sectors, stages, funding_stage,
           location, investor_country, hq_location, email, firm_id::text AS firm_id,
           COALESCE(linkedin_url, person_linkedin_url) AS linkedin, title, typical_investment,
           check_min, check_max, num_lead_investments, total_investments, norm_class
      FROM investors
     WHERE COALESCE(is_active, true)`
  return { firms: firms as Row[], people: people as Row[] }
}

type ExclusionReason = "inCrm" | "declined" | "excludedByFounder"
interface Exclusions {
  keys: Map<string, ExclusionReason>  // firm:<id> | contact:<id> never shown, and why
  queued: Set<string>        // in CRM at "queued": shown, flagged
  emails: Set<string>        // suppressed addresses
  names: Set<string>         // founder-named firms or people
  classes: Set<string>
  counts: { inCrm: number; excludedByFounder: number; suppressed: number; excludedTypes: number; declined: number }
}

/** CRM beyond "queued", saved exclusions, suppressions, founder-named investors and types (doc 11 §6). */
async function loadExclusions(startup: StartupProfile, scope?: RunOptions["scope"]): Promise<Exclusions> {
  const ex: Exclusions = {
    keys: new Map(), queued: new Set(), emails: new Set(),
    names: new Set((startup.excludedInvestors ?? []).map(normPhrase).filter(Boolean)),
    classes: new Set((startup.investorTypesExcluded ?? []).map((t) => investorClass(t)).filter((c) => c !== "other")),
    counts: { inCrm: 0, excludedByFounder: 0, suppressed: 0, excludedTypes: 0, declined: 0 },
  }
  if (!scope) return ex
  const crm = await sql`SELECT firm_id, investor_id, stage FROM crm_entries WHERE org_id = ${scope.orgId}`
  for (const r of crm as Row[]) {
    const keys = [r.firm_id && `firm:${r.firm_id}`, r.investor_id && `contact:${r.investor_id}`].filter(Boolean) as string[]
    for (const k of keys) {
      if (r.stage === "queued") ex.queued.add(k)
      else ex.keys.set(k, r.stage === "passed" ? "declined" : "inCrm")
    }
  }
  const saved = await sql`SELECT entity_key FROM founder_match_exclusions WHERE org_id = ${scope.orgId}`
  for (const r of saved as Row[]) ex.keys.set(r.entity_key, "excludedByFounder")
  const supp = await sql`SELECT lower(email) AS email FROM email_suppressions WHERE user_id = ${scope.userId} OR user_id IS NULL`
  for (const r of supp as Row[]) ex.emails.add(r.email)
  return ex
}

function entityBase(score: V3Score) {
  return {
    score: score.score, tier: score.tier, components: score.components, gates: score.gates,
    reasons: score.reasons, whyMatch: score.why, tags: score.tags,
    factors: {} as any, segments: [] as InvestorSegment[], stage: "identified" as const,
    semanticValue: score.semantic, qualityValue: score.quality,
  }
}

export async function runFounderMatching(startup: StartupProfile, options: RunOptions = {}): Promise<FounderMatchingResult> {
  const startTime = Date.now()
  const minScore = options.minScore ?? FOUNDER_MIN_SCORE
  const maxFirms = options.maxFirms ?? 10000
  const maxContacts = options.maxContacts ?? 10000

  const [{ firms: firmRows, people: peopleRows }, exclusions, semantic, weights] = await Promise.all([
    loadDirectory(), loadExclusions(startup, options.scope), semanticScoresFor(startup), activeWeights(),
  ])
  const firmSem = calibrate(semantic.firms)
  const peopleSem = calibrate(semantic.contacts)
  const ctx = startupContext(startup, semantic.enabled)

  const statusByEmail = await cachedVerifications(peopleRows.map((r) => r.email))

  // ─── Score firms ─────────────────────────────────────────────────────────
  const directoryFirmIds = new Set(firmRows.map((r) => String(r.id)))
  const firms: Scored[] = []
  for (const r of firmRows) {
    const key = `firm:${r.id}`
    const why = exclusions.keys.get(key)
    if (why) { exclusions.counts[why]++; continue }
    if (exclusions.names.has(normPhrase(r.name ?? ""))) { exclusions.counts.excludedByFounder++; continue }
    const facts = firmFacts(r)
    if (exclusions.classes.has(facts.cls)) { exclusions.counts.excludedTypes++; continue }
    const s = scoreInvestor(facts, ctx, firmSem.get(String(r.id)) ?? 0, weights.weights)
    firms.push({
      ...entityBase(s), id: String(r.id), kind: "firm", name: r.name ?? "", type: r.firm_classification ?? r.type ?? "",
      location: r.hq_location ?? r.location ?? "", sectors: facts.sectors.groups, website: r.website ?? null,
      linkedin: r.linkedin_url ?? null, description: r.description ?? null,
      checkSizeMin: facts.check?.min ?? null, checkSizeMax: facts.check?.max ?? null, portfolioCount: facts.portfolioCount,
      stages: facts.stages, firmId: String(r.id), investorClass: facts.cls, country: facts.country, aumRaw: r.aum ?? null,
      lastInvestmentAt: r.last_investment_at ? new Date(r.last_investment_at).toISOString().slice(0, 10) : null,
      lastInvestmentNote: r.last_investment_note ?? null, lastInvestmentSource: r.activity_source_url ?? null,
      inCrm: exclusions.queued.has(key), sparse: !facts.sectors.groups.length && !facts.stages.length,
    } as Scored)
  }

  // ─── Score people ────────────────────────────────────────────────────────
  const people: Scored[] = []
  for (const r of peopleRows) {
    const key = `contact:${r.id}`
    const email = normEmail(r.email)
    const why = exclusions.keys.get(key)
    if (why) { exclusions.counts[why]++; continue }
    if (email && exclusions.emails.has(email)) { exclusions.counts.suppressed++; continue }
    const name = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()
    if (name && exclusions.names.has(normPhrase(name))) { exclusions.counts.excludedByFounder++; continue }
    const status = email ? statusByEmail.get(email)?.status ?? null : null
    const facts = personFacts(r, status)
    if (exclusions.classes.has(facts.cls)) { exclusions.counts.excludedTypes++; continue }
    const s = scoreInvestor(facts, ctx, peopleSem.get(String(r.id)) ?? 0, weights.weights)
    people.push({
      ...entityBase(s), id: String(r.id), kind: "person", name, title: r.title ?? null, type: r.investor_type ?? "",
      location: r.location ?? r.investor_country ?? "", sectors: facts.sectors.groups, email: r.email ?? null,
      emailStatus: status, emailVerified: status === "valid", linkedin: r.linkedin ?? null, bio: r.bio ?? null,
      firmId: r.firm_id ?? null, website: null, stages: facts.stages,
      checkSizeMin: facts.check?.min ?? null, checkSizeMax: facts.check?.max ?? null,
      investorClass: facts.cls, country: facts.country, seniority: seniority(r.title), inCrm: exclusions.queued.has(key),
    } as Scored)
  }

  // ─── Group, rank, cap ────────────────────────────────────────────────────
  const grouped = groupByFirm(firms, people, directoryFirmIds, minScore)
  const qualifiedBeforeCap = { groups: grouped.groups.length, independents: grouped.independents.length }
  let groups = grouped.groups.slice(0, maxFirms)
  const independents = grouped.independents.slice(0, maxContacts)

  // ─── Verify the contacts founders will use first, then choose primaries ─
  let verification = { checked: 0, provider: 0, providerConfigured: false }
  if (options.verifyEmails !== false) {
    const topN = Math.min(groups.length, options.verifyTopGroups ?? 200)
    const emails = new Set<string>()
    for (const g of groups.slice(0, topN)) for (const p of [g.primary, ...g.alternates]) if (p?.email) emails.add(p.email)
    for (const p of independents.slice(0, topN)) if (p.email) emails.add(p.email)
    if (emails.size) {
      const report = await verifyEmails([...emails], { providerLimit: topN })
      verification = { checked: report.results.size, provider: report.provider, providerConfigured: report.providerConfigured }
      const refresh = (p: Scored) => {
        const v = p.email ? report.results.get(normEmail(p.email)!) : undefined
        if (!v) return p
        const next = { ...p, emailStatus: v.status, emailVerified: v.status === "valid" }
        return { ...next, contactRank: contactRank(next) }
      }
      const members = new Map<string, Scored[]>()
      for (const p of people) {
        if (!p.firmId) continue
        if (!members.has(p.firmId)) members.set(p.firmId, [])
        members.get(p.firmId)!.push(p)
      }
      groups = groups.map((g, i) => {
        if (i >= topN) return g
        const refreshed = (members.get(String(g.firm.id)) ?? []).map((p) => refresh({ ...p, firmName: g.firm.name, contactRank: contactRank(p) }))
        return refreshed.length ? { ...g, ...chooseContacts(refreshed) } : g
      })
      for (let i = 0; i < Math.min(topN, independents.length); i++) independents[i] = refresh(independents[i])
    }
  }

  // ─── Segments ────────────────────────────────────────────────────────────
  for (const g of groups) (g.firm as Scored).segments = segmentsFor(g.firm as Scored)
  for (const p of independents) p.segments = segmentsFor(p)

  // ─── AI rationales for the top results ───────────────────────────────────
  let aiEnrichmentsApplied = 0
  const groupFirms = groups.map((g) => g.firm as Scored)
  if (options.enableAi !== false) {
    const why = (e: { whyMatch: string }) => e.whyMatch
    aiEnrichmentsApplied += (await enrichInvestorsWithRationales(groupFirms, startup, why)).enriched
    aiEnrichmentsApplied += (await enrichInvestorsWithRationales(independents, startup, why)).enriched
  }

  // ─── Result ──────────────────────────────────────────────────────────────
  const primaries = groups.map((g) => g.primary && { ...g.primary, segments: (g.firm as Scored).segments, whyMatch: g.primary.whyMatch }).filter(Boolean) as Scored[]
  const contacts = [...primaries, ...independents]
  const reachable = contacts.filter((c) => c.email && isSendable(c.emailStatus ?? "unknown")).length
  const leadCandidates = groupFirms.filter((f) => f.tags.includes("LEAD")).length

  const tierCounts = { firms: emptyTierCounts(), contacts: emptyTierCounts() }
  for (const f of groupFirms) tierCounts.firms[f.tier as TierId]++
  for (const c of independents) tierCounts.contacts[c.tier as TierId]++
  const segmentCounts = { firms: emptySegmentCounts(), contacts: emptySegmentCounts() }
  for (const f of groupFirms) for (const s of f.segments) segmentCounts.firms[s]++
  for (const c of independents) for (const s of c.segments) segmentCounts.contacts[s]++

  const excluded = Object.values(exclusions.counts).reduce((a, b) => a + b, 0)
  const funnel: FounderFunnel = {
    firms: [
      { label: "Firms in the directory", count: firmRows.length, pct: 100 },
      { label: "Excluded (CRM, named, types)", count: excluded, pct: pct(excluded, firmRows.length + peopleRows.length) },
      { label: `Qualified firm groups (≥ ${minScore})`, count: qualifiedBeforeCap.groups, pct: pct(qualifiedBeforeCap.groups, firmRows.length),
        notes: grouped.duplicatesMerged ? `${grouped.duplicatesMerged} duplicates merged` : undefined },
      { label: "Returned", count: groups.length, pct: pct(groups.length, firmRows.length),
        notes: qualifiedBeforeCap.groups > groups.length ? `capped at ${maxFirms}` : undefined },
      { label: "Lead candidates", count: leadCandidates, pct: pct(leadCandidates, firmRows.length) },
    ],
    contacts: [
      { label: "People in the directory", count: peopleRows.length, pct: 100 },
      { label: "Primary contacts (one per firm)", count: primaries.length, pct: pct(primaries.length, peopleRows.length) },
      { label: `Independent investors (≥ ${minScore})`, count: qualifiedBeforeCap.independents, pct: pct(qualifiedBeforeCap.independents, peopleRows.length) },
      { label: "Reachable by email", count: reachable, pct: pct(reachable, peopleRows.length) },
    ],
  }

  const sessionId = `fms_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  return {
    sessionId, startupProfileId: startup.id, startupName: startup.name, ranAt: new Date().toISOString(),
    durationMs: Date.now() - startTime, funnel,
    totals: {
      rawFirms: firmRows.length, rawContacts: peopleRows.length,
      qualifiedFirms: groups.length, qualifiedContacts: contacts.length,
      contactsWithEmail: reachable, leadCandidates, duplicatesMerged: grouped.duplicatesMerged, aiEnrichmentsApplied,
    },
    tierCounts, segmentCounts,
    firms: groupFirms, contacts,
    engineVersion: ENGINE_VERSION, groups, independents,
    // Which weight set ranked this run, so any result can be explained later (doc 17 §4).
    weightSource: weights.source,
    semantic: { status: semantic.status, reason: semantic.reason, models: semantic.models },
    exclusions: exclusions.counts,
    qualifiedBeforeCap,
    emailVerification: verification,
  }
}

function segmentsFor(e: Scored): InvestorSegment[] {
  const out = new Set<InvestorSegment>()
  const tags = e.tags ?? []
  if (tags.includes("LOCAL") && tags.includes("VERTICAL")) out.add("warm_local")
  if (tags.includes("LEAD") && tags.includes("STAGE")) out.add("lead")
  else if (tags.includes("STAGE")) out.add("stage_match")
  if (tags.includes("VERTICAL") && !out.has("lead")) out.add("sector_match")
  if ((e.portfolioCount ?? 0) >= 30) out.add("active_recent")
  if (tags.includes("INTL")) out.add("international")
  if (tags.includes("STAGE") && !tags.includes("LEAD") && (e.components?.checkSize.value ?? 0) >= 0.67) out.add("follow_on")
  return [...out]
}

function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 1000) / 10 : 0
}
function emptyTierCounts(): Record<TierId, number> {
  return TIER_DEFINITIONS.reduce((acc, t) => ({ ...acc, [t.id]: 0 }), {} as Record<TierId, number>)
}
function emptySegmentCounts(): Record<InvestorSegment, number> {
  return INVESTOR_SEGMENTS.reduce((acc, s) => ({ ...acc, [s]: 0 }), {} as Record<InvestorSegment, number>)
}

export { compareRanked }

/**
 * LP Matchmaking Engine v2.
 *
 * Pipeline:
 *   1. SQL pre-filter (cheap, removes obvious non-LPs upstream)
 *   2. Per-entity scoring (pure functions, deterministic)
 *   3. Min-score gate
 *   4. Deduplication (by normalized firm name / email)
 *   5. Segmentation (8 outreach segments)
 *   6. AI enrichment (top-N rationales via Claude)
 *   7. Funnel + summary stats
 *
 * Returns a `MatchingResultV2` ready to be persisted, exported, and rendered.
 */

import { sql } from "@/lib/db"
import { dedupContacts, dedupFirms, normalizeFirmName } from "./dedup"
import { computeContactScore, computeFirmScore, MIN_QUALIFICATION_SCORE } from "./scoring"
import { raiseBand, scoreCapacity, type Capacity } from "./lp-capacity"
import { checkPerson } from "./lp-person"
import { classifyContactSegments, classifyFirmSegments } from "./segmentation"
import {
  enrichContactsWithRationales,
  enrichFirmsWithRationales,
  isAiAvailable,
  ruleBasedRationaleFirm, ruleBasedRationaleContact,
} from "./ai-enrichment"
import {
  FundProfileV2,
  MatchingFunnel,
  MatchingResultV2,
  OutreachSegment,
  OUTREACH_SEGMENTS,
  ProgressEvent,
  ScoredContactV2,
  ScoredFirmV2,
  TIER_DEFINITIONS,
  TierId,
  tierFor,
} from "./types"

interface RunOptions {
  minScore?: number
  maxFirms?: number
  maxContacts?: number
  enableAi?: boolean
  aiTopN?: number
  onProgress?: (event: ProgressEvent) => void
}

export async function runLpMatchingV2(
  fund: FundProfileV2,
  options: RunOptions = {},
): Promise<MatchingResultV2> {
  const startTime = Date.now()
  const minScore = options.minScore ?? MIN_QUALIFICATION_SCORE
  const maxFirms = options.maxFirms ?? 10000
  const maxContacts = options.maxContacts ?? 10000
  const enableAi = options.enableAi !== false && (await isAiAvailable())
  const onProgress = options.onProgress ?? (() => {})

  // ─── Phase 1: load + cheap SQL filter ────────────────────────────────────
  // Note: investment_firms has both `type` and `firm_classification`; investors
  // has `investor_type` (no plain `type`). Selectively COALESCE only on tables
  // where both columns exist.
  onProgress({ phase: "loading", message: "Loading firms from database…" })
  const allFirms = await sql`
    SELECT id, name, COALESCE(firm_classification, type) AS type,
           description, aum, sectors,
           COALESCE(hq_location, location) AS location,
           website, linkedin_url
    FROM investment_firms
  `
  onProgress({ phase: "loading", message: "Loading investors from database…" })
  const allInvestors = await sql`
    SELECT id, first_name, last_name, investor_type AS type,
           bio, sectors, location, email,
           COALESCE(linkedin_url, person_linkedin_url) AS linkedin,
           title, firm_id
    FROM investors
  `

  // A person at a known LP firm inherits that firm's capacity (doc 19 §4).
  const capacityByFirm = new Map<string, Capacity>()
  const band = raiseBand(fund.targetRaise, (fund as any).minimumCommitment)

  // ─── Phase 2: score firms ───────────────────────────────────────────────
  let firmsAccepted: ScoredFirmV2[] = []
  let processed = 0
  for (const f of allFirms) {
    processed++
    const sectors = toStringArray((f as any).sectors)
    const result = computeFirmScore({
      type: (f as any).type,
      description: (f as any).description,
      aum: (f as any).aum,
      sectors,
      location: (f as any).location,
      website: (f as any).website,
      fund,
    } as any)
    if (result.components?.capacity) {
      capacityByFirm.set(String((f as any).id), {
        value: result.components.capacity.value,
        isAnchor: result.isAnchor,
        expectedTicket: result.components.capacity.expectedTicket,
        known: result.components.capacity.known,
        reason: result.reasons[0] ?? "",
        gate: null,
      })
    }
    if (result.total < minScore) continue
    if (result.factors.lpType === 0) continue // failed LP type filter

    firmsAccepted.push({
      firmId: (f as any).id,
      name: (f as any).name ?? "",
      normalizedName: normalizeFirmName((f as any).name ?? ""),
      type: (f as any).type ?? "",
      location: (f as any).location ?? "",
      aumRaw: (f as any).aum ?? null,
      aumUsd: result.parsedAumUsd,
      sectors,
      website: (f as any).website ?? null,
      linkedin: (f as any).linkedin_url ?? null,
      description: (f as any).description ?? null,
      score: result.total,
      tier: tierFor(result.total),
      factors: result.factors,
      reasons: result.reasons,
      whyThisLp: "", // filled by AI enrichment
      tags: Array.from(new Set(result.tags)),
      segments: [],
      stage: "identified",
      isAnchor: result.isAnchor,
      rank: result.rank,
      expectedTicket: result.expectedTicket ?? null,
    } as ScoredFirmV2)

    if (processed % 500 === 0) {
      onProgress({
        phase: "scoring",
        total: allFirms.length,
        processed,
        entity: "firms",
      })
    }
  }
  onProgress({
    phase: "scoring",
    total: allFirms.length,
    processed: allFirms.length,
    entity: "firms",
  })

  // ─── Phase 3: score contacts ────────────────────────────────────────────
  let contactsAccepted: ScoredContactV2[] = []
  let notAPerson = 0
  processed = 0
  for (const inv of allInvestors) {
    processed++
    const fullName = `${(inv as any).first_name ?? ""} ${(inv as any).last_name ?? ""}`.trim()
    // An organisation in the people table is not a contact (doc 19 §5).
    const person = checkPerson(fullName, (inv as any).title)
    if (!person.isPerson) { notAPerson++; continue }

    const sectors = toStringArray((inv as any).sectors)
    const firmId = (inv as any).firm_id ? String((inv as any).firm_id) : null
    const result = computeContactScore({
      type: (inv as any).type,
      bio: (inv as any).bio,
      email: (inv as any).email,
      linkedin: (inv as any).linkedin,
      sectors,
      location: (inv as any).location,
      title: (inv as any).title,
      fund,
      firmCapacity: firmId ? capacityByFirm.get(firmId) ?? null : null,
    })
    if (result.total < minScore) continue
    if (result.factors.lpType === 0) continue

    contactsAccepted.push({
      investorId: (inv as any).id,
      name: fullName,
      title: (inv as any).title ?? null,
      type: (inv as any).type ?? "",
      location: (inv as any).location ?? "",
      email: (inv as any).email ?? null,
      emailVerified: result.emailVerified,
      linkedin: (inv as any).linkedin ?? null,
      sectors,
      bio: (inv as any).bio ?? null,
      score: result.total,
      tier: tierFor(result.total),
      factors: result.factors,
      reasons: result.reasons,
      whyThisLp: "",
      tags: Array.from(new Set(result.tags)),
      segments: [],
      stage: "identified",
      isHnwAngel: result.tags.includes("HNW-Angel"),
      hnwSignals: result.hnwSignals,
      rank: result.rank,
      expectedTicket: result.expectedTicket ?? null,
    })

    if (processed % 1000 === 0) {
      onProgress({
        phase: "scoring",
        total: allInvestors.length,
        processed,
        entity: "contacts",
      })
    }
  }

  // ─── Phase 4: dedup ─────────────────────────────────────────────────────
  const beforeFirmsCount = firmsAccepted.length
  const beforeContactsCount = contactsAccepted.length
  const dedupedFirms = dedupFirms(firmsAccepted)
  const dedupedContacts = dedupContacts(contactsAccepted)
  firmsAccepted = dedupedFirms.merged
  contactsAccepted = dedupedContacts.merged
  const duplicatesMerged = dedupedFirms.mergedCount + dedupedContacts.mergedCount
  onProgress({ phase: "deduplication", merged: duplicatesMerged })

  // Sort by score desc, cap at max
  // Ties are broken by evidence, in the order doc 19 §7 sets out — never by
  // the order the scan happened to produce.
  const byEvidence = (a: { score: number; rank?: any; name: string }, b: { score: number; rank?: any; name: string }) =>
    b.score - a.score
    || (b.rank?.capacityKnown ?? 0) - (a.rank?.capacityKnown ?? 0)
    || (b.rank?.thesisMatched ?? 0) - (a.rank?.thesisMatched ?? 0)
    || (b.rank?.sectorMatched ?? 0) - (a.rank?.sectorMatched ?? 0)
    || (b.rank?.evidence ?? 0) - (a.rank?.evidence ?? 0)
    || a.name.localeCompare(b.name)
  firmsAccepted.sort(byEvidence as any)
  contactsAccepted.sort(byEvidence as any)
  firmsAccepted = firmsAccepted.slice(0, maxFirms)
  contactsAccepted = contactsAccepted.slice(0, maxContacts)

  // ─── Phase 5: segmentation ──────────────────────────────────────────────
  for (const f of firmsAccepted) f.segments = classifyFirmSegments(f, fund)
  for (const c of contactsAccepted) c.segments = classifyContactSegments(c, fund)

  // ─── Phase 6: AI enrichment ─────────────────────────────────────────────
  let aiEnrichmentsApplied = 0
  if (enableAi) {
    onProgress({ phase: "ai_enrichment", total: firmsAccepted.length, processed: 0 })
    const fr = await enrichFirmsWithRationales(firmsAccepted, fund, (p) =>
      onProgress({ phase: "ai_enrichment", total: firmsAccepted.length, processed: p }),
    )
    const cr = await enrichContactsWithRationales(contactsAccepted, fund, (p) =>
      onProgress({ phase: "ai_enrichment", total: contactsAccepted.length, processed: p }),
    )
    aiEnrichmentsApplied = fr.enriched + cr.enriched
  } else {
    // Fill rationales via rule-based path even without AI
    for (const firm of firmsAccepted) firm.whyThisLp = ruleBasedRationaleFirm(firm)
    for (const contact of contactsAccepted) contact.whyThisLp = ruleBasedRationaleContact(contact)
  }

  // ─── Phase 7: stats + funnel ────────────────────────────────────────────
  const contactsWithEmail = contactsAccepted.filter((c) => c.emailVerified).length
  const anchorCandidates = firmsAccepted.filter((f) => f.isAnchor).length

  const tierCounts = {
    firms: emptyTierCounts(),
    contacts: emptyTierCounts(),
  }
  for (const f of firmsAccepted) tierCounts.firms[f.tier]++
  for (const c of contactsAccepted) tierCounts.contacts[c.tier]++

  const segmentCounts = {
    firms: emptySegmentCounts(),
    contacts: emptySegmentCounts(),
  }
  for (const f of firmsAccepted) for (const s of f.segments) segmentCounts.firms[s]++
  for (const c of contactsAccepted) for (const s of c.segments) segmentCounts.contacts[s]++

  const funnel: MatchingFunnel = {
    firms: [
      { label: "Raw database", count: allFirms.length, pct: 100 },
      {
        label: "Pre-dedup qualified",
        count: beforeFirmsCount,
        pct: pct(beforeFirmsCount, allFirms.length),
      },
      {
        label: `Qualified (score ≥ ${minScore})`,
        count: firmsAccepted.length,
        pct: pct(firmsAccepted.length, allFirms.length),
        notes: duplicatesMerged > 0 ? `${dedupedFirms.mergedCount} duplicates merged` : undefined,
      },
      {
        label: "Could anchor this fund",
        count: anchorCandidates,
        pct: pct(anchorCandidates, allFirms.length),
      },
      {
        label: "University/research focus",
        count: firmsAccepted.filter((f) => f.tags.includes("UNI")).length,
        pct: pct(
          firmsAccepted.filter((f) => f.tags.includes("UNI")).length,
          allFirms.length,
        ),
      },
      {
        label: "Emerging manager programs",
        count: firmsAccepted.filter((f) => f.tags.includes("EM")).length,
        pct: pct(
          firmsAccepted.filter((f) => f.tags.includes("EM")).length,
          allFirms.length,
        ),
      },
      {
        label: "Local",
        count: firmsAccepted.filter((f) => f.segments.includes("local")).length,
        pct: pct(
          firmsAccepted.filter((f) => f.segments.includes("local")).length,
          allFirms.length,
        ),
      },
    ],
    contacts: [
      { label: "Raw database", count: allInvestors.length, pct: 100 },
      {
        // Organisations held in the people table — counted, never silently
        // dropped, and already present in the firm list (doc 19 §5).
        label: "Organisations removed from people",
        count: notAPerson,
        pct: pct(notAPerson, allInvestors.length),
      },
      {
        label: "Pre-dedup qualified",
        count: beforeContactsCount,
        pct: pct(beforeContactsCount, allInvestors.length),
      },
      {
        label: `Qualified (score ≥ ${minScore})`,
        count: contactsAccepted.length,
        pct: pct(contactsAccepted.length, allInvestors.length),
        notes:
          dedupedContacts.mergedCount > 0
            ? `${dedupedContacts.mergedCount} duplicates merged`
            : undefined,
      },
      {
        label: "With verified email",
        count: contactsWithEmail,
        pct: pct(contactsWithEmail, allInvestors.length),
      },
      {
        label: "HNW angels (2+ signals)",
        count: contactsAccepted.filter((c) => c.isHnwAngel).length,
        pct: pct(
          contactsAccepted.filter((c) => c.isHnwAngel).length,
          allInvestors.length,
        ),
      },
    ],
  }

  // uuid: lp_match_sessions.id is a uuid column other tables reference (doc 18 §1).
  const sessionId = crypto.randomUUID()
  const durationMs = Date.now() - startTime

  const result: MatchingResultV2 = {
    sessionId,
    fundProfileId: fund.id,
    fundName: fund.name,
    ranAt: new Date().toISOString(),
    durationMs,
    funnel,
    totals: {
      rawFirms: allFirms.length,
      rawContacts: allInvestors.length,
      qualifiedFirms: firmsAccepted.length,
      qualifiedContacts: contactsAccepted.length,
      contactsWithEmail,
      anchorCandidates,
      duplicatesMerged,
      aiEnrichmentsApplied,
    },
    tierCounts,
    segmentCounts,
    firms: firmsAccepted,
    contacts: contactsAccepted,
  }
  onProgress({ phase: "done", result })
  return result
}

function emptyTierCounts(): Record<TierId, number> {
  return TIER_DEFINITIONS.reduce(
    (acc, t) => ({ ...acc, [t.id]: 0 }),
    {} as Record<TierId, number>,
  )
}
function emptySegmentCounts(): Record<OutreachSegment, number> {
  return OUTREACH_SEGMENTS.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<OutreachSegment, number>,
  )
}
function pct(num: number, denom: number): number {
  if (!denom) return 0
  return Math.round((num / denom) * 1000) / 10 // 1 decimal place
}

/**
 * The data layer is messy: PGlite returns JSONB as a parsed array, Neon may
 * return a JSON string, and the underlying source has occasional `null` /
 * non-string entries inside sector arrays. Coerce defensively.
 */
function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === "string" && x.length > 0)
  }
  if (typeof v === "string" && v.length) {
    try {
      const parsed = JSON.parse(v)
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === "string" && x.length > 0)
      }
    } catch {
      // fall through
    }
    return v.split(",").map((s) => s.trim()).filter(Boolean)
  }
  return []
}

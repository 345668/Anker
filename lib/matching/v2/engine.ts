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
import { classifyContactSegments, classifyFirmSegments } from "./segmentation"
import {
  enrichContactsWithRationales,
  enrichFirmsWithRationales,
  isAiAvailable,
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
  const enableAi = options.enableAi !== false && isAiAvailable()
  const onProgress = options.onProgress ?? (() => {})

  // ─── Phase 1: load + cheap SQL filter ────────────────────────────────────
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
    SELECT id, first_name, last_name, COALESCE(investor_type, type) AS type,
           bio, sectors, location, email,
           COALESCE(linkedin_url, person_linkedin_url) AS linkedin,
           title
    FROM investors
  `

  // ─── Phase 2: score firms ───────────────────────────────────────────────
  let firmsAccepted: ScoredFirmV2[] = []
  let processed = 0
  for (const f of allFirms) {
    processed++
    const sectors = Array.isArray((f as any).sectors)
      ? ((f as any).sectors as string[])
      : []
    const result = computeFirmScore({
      type: (f as any).type,
      description: (f as any).description,
      aum: (f as any).aum,
      sectors,
      location: (f as any).location,
      fund,
    })
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
    })

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
  processed = 0
  for (const inv of allInvestors) {
    processed++
    const sectors = Array.isArray((inv as any).sectors)
      ? ((inv as any).sectors as string[])
      : []
    const result = computeContactScore({
      type: (inv as any).type,
      bio: (inv as any).bio,
      email: (inv as any).email,
      linkedin: (inv as any).linkedin,
      sectors,
      location: (inv as any).location,
      fund,
    })
    if (result.total < minScore) continue
    if (result.factors.lpType === 0) continue

    contactsAccepted.push({
      investorId: (inv as any).id,
      name: `${(inv as any).first_name ?? ""} ${(inv as any).last_name ?? ""}`.trim(),
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
  firmsAccepted.sort((a, b) => b.score - a.score)
  contactsAccepted.sort((a, b) => b.score - a.score)
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
    await enrichFirmsWithRationales(firmsAccepted, fund)
    await enrichContactsWithRationales(contactsAccepted, fund)
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
        label: "Anchor capacity ($500M+)",
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

  const sessionId = `lms_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
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

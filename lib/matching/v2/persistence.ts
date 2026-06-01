/**
 * Bulk persistence — replaces the N+1 INSERT loop with chunked multi-row
 * VALUES. Neon's serverless driver supports parameterized arrays via
 * tagged template; we manually compose multi-row INSERTs in 200-row batches.
 *
 * Round-trip count:
 *   old: 4,000+ inserts per session  (per-row await)
 *   new: ~25 inserts per session     (200-row batches)
 */

import { sql } from "@/lib/db"
import type { MatchingResultV2, ScoredFirmV2, ScoredContactV2 } from "./types"

const CHUNK = 200

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

export async function saveSessionV2(
  result: MatchingResultV2,
  userId?: string,
): Promise<void> {
  // 1) Session row
  await sql`
    INSERT INTO lp_match_sessions (
      id, fund_profile_id, fund_name,
      total_firms_scored, total_contacts_scored,
      qualified_firms, qualified_contacts,
      contacts_with_email, anchor_candidates,
      tier_counts, duration_ms, user_id, created_at,
      funnel_data, segment_counts, ai_enrichments_applied, duplicates_merged,
      engine_version
    ) VALUES (
      ${result.sessionId}, ${result.fundProfileId}, ${result.fundName},
      ${result.totals.rawFirms}, ${result.totals.rawContacts},
      ${result.totals.qualifiedFirms}, ${result.totals.qualifiedContacts},
      ${result.totals.contactsWithEmail}, ${result.totals.anchorCandidates},
      ${JSON.stringify(result.tierCounts)}, ${result.durationMs}, ${userId || null}, NOW(),
      ${JSON.stringify(result.funnel)}, ${JSON.stringify(result.segmentCounts)},
      ${result.totals.aiEnrichmentsApplied}, ${result.totals.duplicatesMerged},
      'v2'
    )
    ON CONFLICT (id) DO NOTHING
  `

  // 2) Firms — batched
  for (let i = 0; i < result.firms.length; i += CHUNK) {
    const batch = result.firms.slice(i, i + CHUNK)
    await insertFirmBatch(batch, result.sessionId, result.fundProfileId)
  }

  // 3) Contacts — batched
  for (let i = 0; i < result.contacts.length; i += CHUNK) {
    const batch = result.contacts.slice(i, i + CHUNK)
    await insertContactBatch(batch, result.sessionId, result.fundProfileId)
  }
}

async function insertFirmBatch(batch: ScoredFirmV2[], sessionId: string, fundProfileId: string) {
  if (!batch.length) return
  // Build a single multi-row INSERT via UNNEST
  const ids = batch.map(() => id("lfm"))
  await sql`
    INSERT INTO lp_firm_matches (
      id, session_id, fund_profile_id, firm_id, firm_name, firm_type,
      firm_location, firm_aum, firm_aum_usd, firm_sectors, firm_website, firm_linkedin,
      score, tier, tags, reasons, why_this_lp,
      factor_lp_type, factor_aum, factor_sector, factor_geo, factor_thesis_signals,
      segments, stage, created_at
    )
    SELECT * FROM UNNEST(
      ${ids}::text[],
      ${batch.map(() => sessionId)}::text[],
      ${batch.map(() => fundProfileId)}::text[],
      ${batch.map((f) => f.firmId)}::text[],
      ${batch.map((f) => f.name)}::text[],
      ${batch.map((f) => f.type)}::text[],
      ${batch.map((f) => f.location)}::text[],
      ${batch.map((f) => f.aumRaw ?? "")}::text[],
      ${batch.map((f) => f.aumUsd ?? null)}::float8[],
      ${batch.map((f) => f.sectors.join(", "))}::text[],
      ${batch.map((f) => f.website ?? "")}::text[],
      ${batch.map((f) => f.linkedin ?? "")}::text[],
      ${batch.map((f) => f.score)}::int[],
      ${batch.map((f) => f.tier)}::text[],
      ${batch.map((f) => JSON.stringify(f.tags))}::jsonb[],
      ${batch.map((f) => JSON.stringify(f.reasons))}::jsonb[],
      ${batch.map((f) => f.whyThisLp)}::text[],
      ${batch.map((f) => f.factors.lpType)}::int[],
      ${batch.map((f) => f.factors.aum)}::int[],
      ${batch.map((f) => f.factors.sector)}::int[],
      ${batch.map((f) => f.factors.geography)}::int[],
      ${batch.map((f) => f.factors.thesis)}::int[],
      ${batch.map((f) => JSON.stringify(f.segments))}::jsonb[],
      ${batch.map((f) => f.stage)}::text[],
      ${batch.map(() => new Date().toISOString())}::timestamptz[]
    )
  `
}

async function insertContactBatch(batch: ScoredContactV2[], sessionId: string, fundProfileId: string) {
  if (!batch.length) return
  const ids = batch.map(() => id("lcm"))
  await sql`
    INSERT INTO lp_contact_matches (
      id, session_id, fund_profile_id, investor_id, contact_name, contact_title,
      contact_type, contact_location, contact_email, contact_linkedin, contact_sectors,
      score, tier, tags, reasons, why_this_lp,
      factor_lp_type, factor_sector, factor_geo, factor_thesis_signals, factor_contact_quality,
      segments, hnw_signals, stage, created_at
    )
    SELECT * FROM UNNEST(
      ${ids}::text[],
      ${batch.map(() => sessionId)}::text[],
      ${batch.map(() => fundProfileId)}::text[],
      ${batch.map((c) => c.investorId)}::text[],
      ${batch.map((c) => c.name)}::text[],
      ${batch.map((c) => c.title ?? "")}::text[],
      ${batch.map((c) => c.type)}::text[],
      ${batch.map((c) => c.location)}::text[],
      ${batch.map((c) => c.email ?? "")}::text[],
      ${batch.map((c) => c.linkedin ?? "")}::text[],
      ${batch.map((c) => c.sectors.join(", "))}::text[],
      ${batch.map((c) => c.score)}::int[],
      ${batch.map((c) => c.tier)}::text[],
      ${batch.map((c) => JSON.stringify(c.tags))}::jsonb[],
      ${batch.map((c) => JSON.stringify(c.reasons))}::jsonb[],
      ${batch.map((c) => c.whyThisLp)}::text[],
      ${batch.map((c) => c.factors.lpType)}::int[],
      ${batch.map((c) => c.factors.sector)}::int[],
      ${batch.map((c) => c.factors.geography)}::int[],
      ${batch.map((c) => c.factors.thesis)}::int[],
      ${batch.map((c) => c.factors.contact)}::int[],
      ${batch.map((c) => JSON.stringify(c.segments))}::jsonb[],
      ${batch.map((c) => JSON.stringify(c.hnwSignals))}::jsonb[],
      ${batch.map((c) => c.stage)}::text[],
      ${batch.map(() => new Date().toISOString())}::timestamptz[]
    )
  `
}

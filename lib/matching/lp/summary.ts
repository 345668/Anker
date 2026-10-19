/** A finished run described for the page and for people watching it (docs/architecture/63 section 5): the same shape whether the run finished inside the request or later. */
import { describeFilters, hasFilters, parseFilters } from "@/lib/matching/filters"
import { compareSessions, previousSessionId } from "./matches"
import { describeExclusions } from "./rules"

const jf = (v: any) => (v == null ? null : typeof v === "string" ? (() => { try { return JSON.parse(v) } catch { return null } })() : v)

export async function summaryOfSession(orgId: string, s: any) {
  const filters = parseFilters(jf(s.filters_applied))
  const exclusions = jf(s.exclusion_counts)
  let sincePrevious: unknown = null
  try {
    const prev = await previousSessionId(orgId, s)
    const cmp = prev ? await compareSessions(orgId, String(s.id), prev, 8) : null
    if (cmp) sincePrevious = { previousSessionId: prev, previousAt: cmp.older.createdAt, newCount: cmp.newCount, droppedCount: cmp.droppedCount, newFirms: cmp.newFirms, droppedFirms: cmp.droppedFirms, firmsDelta: cmp.firmsDelta, contactsDelta: cmp.contactsDelta }
  } catch { /* the comparison is a convenience */ }
  return {
    sessionId: String(s.id), fundProfileId: String(s.fund_profile_id), fundName: s.fund_name ?? "", ranAt: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at),
    durationMs: Number(s.duration_ms ?? 0), filters, filterSummary: filters && hasFilters(filters) ? describeFilters(filters) : "",
    exclusions: exclusions ?? null, exclusionSummary: exclusions ? describeExclusions(exclusions) : "", confidenceCounts: jf(s.confidence_counts) ?? null, sincePrevious,
    totals: {
      rawFirms: Number(s.total_firms_scored ?? 0), rawContacts: Number(s.total_contacts_scored ?? 0), qualifiedFirms: Number(s.qualified_firms ?? 0), qualifiedContacts: Number(s.qualified_contacts ?? 0),
      contactsWithEmail: Number(s.contacts_with_email ?? 0), anchorCandidates: Number(s.anchor_candidates ?? 0), duplicatesMerged: Number(s.duplicates_merged ?? 0), aiEnrichmentsApplied: Number(s.ai_enrichments_applied ?? 0),
    },
    tierCounts: jf(s.tier_counts), segmentCounts: jf(s.segment_counts), funnel: jf(s.funnel_data) ?? { firms: [], contacts: [] },
  }
}

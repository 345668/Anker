/**
 * A saved LP run read back as the engine's own result shape (docs/architecture/63 section 5, deliverables), for the workbook, the methodology note, the agenda and the CSV files.
 * One reader for all of them, so the download buttons, the single-file routes and the zip say the same thing.
 */
import { sql } from "@/lib/db"
import { toFundProfile } from "@/lib/matching/fund-profile"
import { sessionInWorkspace } from "./matches"
import { OUTREACH_SEGMENTS, TIER_DEFINITIONS, tierFor, type FundProfileV2, type MatchingResultV2, type OutreachSegment, type ScoredContactV2, type ScoredFirmV2, type TierId } from "@/lib/matching/v2/types"

const jsonField = (v: unknown): any => {
  if (v == null) return []
  if (Array.isArray(v) || typeof v === "object") return v
  try { return JSON.parse(v as string) } catch { return [] }
}
const emptyTiers = () => TIER_DEFINITIONS.reduce((a, t) => ({ ...a, [t.id]: 0 }), {} as Record<TierId, number>)
const emptySegments = () => OUTREACH_SEGMENTS.reduce((a, s) => ({ ...a, [s]: 0 }), {} as Record<OutreachSegment, number>)

export async function loadSessionResult(orgId: string, sessionId: string): Promise<{ session: any; fund: FundProfileV2; result: MatchingResultV2 } | null> {
  const session = await sessionInWorkspace(orgId, sessionId)
  if (!session) return null
  const [fundRow] = (await sql`SELECT * FROM fund_profiles WHERE id = ${session.fund_profile_id} LIMIT 1`) as any[]
  if (!fundRow) return null
  const firmsRows = (await sql`SELECT * FROM lp_firm_matches WHERE session_id::text = ${sessionId} ORDER BY score DESC, firm_name ASC`) as any[]
  const contactsRows = (await sql`SELECT * FROM lp_contact_matches WHERE session_id::text = ${sessionId} ORDER BY score DESC, contact_name ASC`) as any[]
  const fund = toFundProfile(fundRow)
  return { session, fund, result: mapResult(session, firmsRows, contactsRows) }
}

export function mapResult(session: any, firmsRows: any[], contactsRows: any[]): MatchingResultV2 {
  const firms: ScoredFirmV2[] = firmsRows.map((f) => ({
    firmId: f.firm_id, name: f.firm_name, normalizedName: (f.firm_name ?? "").toLowerCase(), type: f.firm_type ?? "", location: f.firm_location ?? "",
    aumRaw: f.firm_aum ?? null, aumUsd: f.firm_aum_usd ?? null, sectors: (f.firm_sectors ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
    website: f.firm_website ?? null, linkedin: f.firm_linkedin ?? null, description: null,
    score: Number(f.score ?? 0), tier: (f.tier ?? tierFor(Number(f.score ?? 0))) as TierId,
    factors: { lpType: f.factor_lp_type ?? 0, aum: f.factor_aum ?? 0, sector: f.factor_sector ?? 0, geography: f.factor_geo ?? 0, thesis: f.factor_thesis_signals ?? 0, contact: 0 },
    reasons: jsonField(f.reasons), whyThisLp: f.why_this_lp ?? "", tags: jsonField(f.tags), segments: jsonField(f.segments) as OutreachSegment[],
    stage: f.stage ?? "identified", isAnchor: jsonField(f.tags).includes("ANCHOR"), expectedTicket: f.expected_ticket_usd == null ? null : Number(f.expected_ticket_usd),
    gaps: jsonField(f.gaps), confidence: f.confidence ?? undefined,
  }))
  const contacts: ScoredContactV2[] = contactsRows.map((c) => ({
    investorId: c.investor_id, name: c.contact_name, title: c.contact_title ?? null, type: c.contact_type ?? "", location: c.contact_location ?? "",
    email: c.contact_email ?? null, emailVerified: !!c.contact_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contact_email), linkedin: c.contact_linkedin ?? null,
    sectors: (c.contact_sectors ?? "").split(",").map((s: string) => s.trim()).filter(Boolean), bio: null,
    score: Number(c.score ?? 0), tier: (c.tier ?? tierFor(Number(c.score ?? 0))) as TierId,
    factors: { lpType: c.factor_lp_type ?? 0, aum: 0, sector: c.factor_sector ?? 0, geography: c.factor_geo ?? 0, thesis: c.factor_thesis_signals ?? 0, contact: c.factor_contact_quality ?? 0 },
    reasons: jsonField(c.reasons), whyThisLp: c.why_this_lp ?? "", tags: jsonField(c.tags), segments: jsonField(c.segments) as OutreachSegment[],
    stage: c.stage ?? "identified", isHnwAngel: jsonField(c.tags).includes("HNW-Angel"), hnwSignals: jsonField(c.hnw_signals),
    expectedTicket: c.expected_ticket_usd == null ? null : Number(c.expected_ticket_usd), gaps: jsonField(c.gaps), confidence: c.confidence ?? undefined,
  }))
  const tierCounts = { firms: emptyTiers(), contacts: emptyTiers() }
  for (const f of firms) tierCounts.firms[f.tier]++
  for (const c of contacts) tierCounts.contacts[c.tier]++
  const segmentCounts = { firms: emptySegments(), contacts: emptySegments() }
  for (const f of firms) for (const s of f.segments) segmentCounts.firms[s]++
  for (const c of contacts) for (const s of c.segments) segmentCounts.contacts[s]++
  return {
    sessionId: session.id, fundProfileId: session.fund_profile_id, fundName: session.fund_name,
    ranAt: session.created_at instanceof Date ? session.created_at.toISOString() : String(session.created_at),
    durationMs: session.duration_ms ?? 0, funnel: jsonField(session.funnel_data) as any,
    totals: {
      rawFirms: session.total_firms_scored ?? 0, rawContacts: session.total_contacts_scored ?? 0,
      qualifiedFirms: session.qualified_firms ?? firms.length, qualifiedContacts: session.qualified_contacts ?? contacts.length,
      contactsWithEmail: session.contacts_with_email ?? contacts.filter((c) => c.emailVerified).length,
      anchorCandidates: session.anchor_candidates ?? firms.filter((f) => f.isAnchor).length,
      duplicatesMerged: session.duplicates_merged ?? 0, aiEnrichmentsApplied: session.ai_enrichments_applied ?? 0,
    },
    tierCounts, segmentCounts, firms, contacts,
    ...(session.exclusion_counts ? { exclusions: session.exclusion_counts } : {}),
  }
}

/** A CSV cell, quoted where it needs it. Text that a spreadsheet would read as a formula (it starts with =, +, - or @) gets a leading apostrophe, so a directory name cannot run as one. */
function cell(v: unknown): string {
  let s = v == null ? "" : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const row = (cells: unknown[]) => cells.map(cell).join(",")

/** Firms as CSV: rank first, the stable key last, so a list can be put back into the CRM without a lookup (docs/architecture/18 section 3.2). */
export function firmsCsv(result: MatchingResultV2): string {
  const head = ["rank", "name", "type", "location", "aum_usd", "likely_cheque_usd", "tier", "score", "confidence", "why", "not_known", "stage", "key"]
  return [row(head), ...result.firms.map((f, i) => row([i + 1, f.name, f.type, f.location, f.aumUsd ?? "", f.expectedTicket ?? "", f.tier, f.score, f.confidence ?? "", f.whyThisLp, (f.gaps ?? []).join("; "), f.stage, `firm:${f.firmId}`]))].join("\r\n") + "\r\n"
}
export function contactsCsv(result: MatchingResultV2): string {
  const head = ["rank", "name", "title", "type", "location", "email", "linkedin", "tier", "score", "confidence", "why", "not_known", "stage", "key"]
  return [row(head), ...result.contacts.map((c, i) => row([i + 1, c.name, c.title ?? "", c.type, c.location, c.email ?? "", c.linkedin ?? "", c.tier, c.score, c.confidence ?? "", c.whyThisLp, (c.gaps ?? []).join("; "), c.stage, `contact:${c.investorId}`]))].join("\r\n") + "\r\n"
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "fund"

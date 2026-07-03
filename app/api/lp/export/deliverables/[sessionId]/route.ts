/**
 * Deliverable bundle endpoint.
 *
 * Returns a single file based on `?format=` query:
 *   - format=xlsx     → 5-sheet workbook
 *   - format=methodology → methodology.md
 *   - format=agenda   → meeting-agenda.md
 *
 * (Default: xlsx.) For a true zip bundle the client can call all three in
 * sequence — keeps this route dependency-free.
 */

import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { markdownToDocxBuffer } from "@/lib/ai/docx-export"
import {
  buildPipelineWorkbook,
  workbookToBuffer,
  buildMethodologyMarkdown,
  buildMeetingAgendaMarkdown,
  type FundProfileV2,
  type MatchingResultV2,
  type ScoredFirmV2,
  type ScoredContactV2,
  type TierId,
  type OutreachSegment,
  TIER_DEFINITIONS,
  OUTREACH_SEGMENTS,
  tierFor,
} from "@/lib/matching/v2"

export const runtime = "nodejs"

interface RouteCtx {
  params: Promise<{ sessionId: string }>
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { sessionId } = await ctx.params
  const format = req.nextUrl.searchParams.get("format") ?? "xlsx"

  // Load session
  const [session] = await sql`SELECT * FROM lp_match_sessions WHERE id = ${sessionId} LIMIT 1`
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }
  const [fundRow] = await sql`SELECT * FROM fund_profiles WHERE id = ${(session as any).fund_profile_id} LIMIT 1`
  if (!fundRow) {
    return NextResponse.json({ error: "Fund profile missing" }, { status: 404 })
  }

  const firms = await sql`
    SELECT * FROM lp_firm_matches
    WHERE session_id = ${sessionId}
    ORDER BY score DESC
  `
  const contacts = await sql`
    SELECT * FROM lp_contact_matches
    WHERE session_id = ${sessionId}
    ORDER BY score DESC
  `

  const fund = mapFund(fundRow)
  const result = mapResult(session, fund, firms, contacts)

  if (format === "methodology") {
    const md = buildMethodologyMarkdown(result, fund)
    return await respondMdOrDocx(req, md, `${slug(fund.name)}-methodology`)
  }

  if (format === "agenda") {
    const md = buildMeetingAgendaMarkdown(result, fund)
    return await respondMdOrDocx(req, md, `${slug(fund.name)}-meeting-agenda`)
  }

  // Default: xlsx
  const wb = buildPipelineWorkbook(result, fund)
  const buf = workbookToBuffer(wb)
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${slug(fund.name)}-lp-pipeline.xlsx"`,
    },
  })
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/** Markdown by default, .docx when ?doc=docx is passed. */
async function respondMdOrDocx(req: NextRequest, md: string, baseName: string) {
  if (req.nextUrl.searchParams.get("doc") === "docx") {
    const buf = await markdownToDocxBuffer(md, baseName)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${baseName}.docx"`,
      },
    })
  }
  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseName}.md"`,
    },
  })
}

function jsonField(v: unknown): any {
  if (v == null) return []
  if (Array.isArray(v) || typeof v === "object") return v
  try { return JSON.parse(v as string) } catch { return [] }
}

function mapFund(row: any): FundProfileV2 {
  // Map fund_profiles columns to expected FundProfileV2 format
  // Actual columns: fund_name, target_fund_size, target_sectors, target_geographies
  return {
    id: row.id,
    name: row.fund_name ?? row.name,
    fundNumber: undefined,
    targetRaise: row.target_fund_size ?? row.target_raise ?? null,
    averageTicket: null,
    sectors: jsonField(row.target_sectors ?? row.sectors),
    primarySectors: jsonField(row.target_sectors ?? row.primary_sectors),
    geographicFocus: jsonField(row.target_geographies ?? row.geographic_focus),
    headquartersLocation: null,
    thesisKeywords: [],
    fundIPriorLpFirmIds: undefined,
    fundIPriorContactEmails: undefined,
  }
}

function mapResult(
  session: any,
  fund: FundProfileV2,
  firmsRows: any[],
  contactsRows: any[],
): MatchingResultV2 {
  const firms: ScoredFirmV2[] = firmsRows.map((f) => ({
    firmId: f.firm_id,
    name: f.firm_name,
    normalizedName: (f.firm_name ?? "").toLowerCase(),
    type: f.firm_type ?? "",
    location: f.firm_location ?? "",
    aumRaw: f.firm_aum ?? null,
    aumUsd: f.firm_aum_usd ?? null,
    sectors: (f.firm_sectors ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
    website: f.firm_website ?? null,
    linkedin: f.firm_linkedin ?? null,
    description: null,
    score: f.score ?? 0,
    tier: (f.tier ?? tierFor(f.score ?? 0)) as TierId,
    factors: {
      lpType: f.factor_lp_type ?? 0,
      aum: f.factor_aum ?? 0,
      sector: f.factor_sector ?? 0,
      geography: f.factor_geo ?? 0,
      thesis: f.factor_thesis_signals ?? 0,
      contact: 0,
    },
    reasons: jsonField(f.reasons),
    whyThisLp: f.why_this_lp ?? "",
    tags: jsonField(f.tags),
    segments: jsonField(f.segments) as OutreachSegment[],
    stage: f.stage ?? "identified",
    isAnchor: jsonField(f.tags).includes("ANCHOR"),
  }))

  const contacts: ScoredContactV2[] = contactsRows.map((c) => ({
    investorId: c.investor_id,
    name: c.contact_name,
    title: c.contact_title ?? null,
    type: c.contact_type ?? "",
    location: c.contact_location ?? "",
    email: c.contact_email ?? null,
    emailVerified: !!c.contact_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contact_email),
    linkedin: c.contact_linkedin ?? null,
    sectors: (c.contact_sectors ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
    bio: null,
    score: c.score ?? 0,
    tier: (c.tier ?? tierFor(c.score ?? 0)) as TierId,
    factors: {
      lpType: c.factor_lp_type ?? 0,
      aum: 0,
      sector: c.factor_sector ?? 0,
      geography: c.factor_geo ?? 0,
      thesis: c.factor_thesis_signals ?? 0,
      contact: c.factor_contact_quality ?? 0,
    },
    reasons: jsonField(c.reasons),
    whyThisLp: c.why_this_lp ?? "",
    tags: jsonField(c.tags),
    segments: jsonField(c.segments) as OutreachSegment[],
    stage: c.stage ?? "identified",
    isHnwAngel: jsonField(c.tags).includes("HNW-Angel"),
    hnwSignals: jsonField(c.hnw_signals),
  }))

  const tierCounts = {
    firms: emptyTierCounts(),
    contacts: emptyTierCounts(),
  }
  for (const f of firms) tierCounts.firms[f.tier]++
  for (const c of contacts) tierCounts.contacts[c.tier]++
  const segmentCounts = {
    firms: emptySegmentCounts(),
    contacts: emptySegmentCounts(),
  }
  for (const f of firms) for (const s of f.segments) segmentCounts.firms[s]++
  for (const c of contacts) for (const s of c.segments) segmentCounts.contacts[s]++

  return {
    sessionId: session.id,
    fundProfileId: session.fund_profile_id,
    fundName: session.fund_name,
    ranAt: session.created_at instanceof Date ? session.created_at.toISOString() : String(session.created_at),
    durationMs: session.duration_ms ?? 0,
    funnel: jsonField(session.funnel_data) as any,
    totals: {
      rawFirms: session.total_firms_scored ?? 0,
      rawContacts: session.total_contacts_scored ?? 0,
      qualifiedFirms: session.qualified_firms ?? firms.length,
      qualifiedContacts: session.qualified_contacts ?? contacts.length,
      contactsWithEmail: session.contacts_with_email ?? contacts.filter((c) => c.emailVerified).length,
      anchorCandidates: session.anchor_candidates ?? firms.filter((f) => f.isAnchor).length,
      duplicatesMerged: session.duplicates_merged ?? 0,
      aiEnrichmentsApplied: session.ai_enrichments_applied ?? 0,
    },
    tierCounts,
    segmentCounts,
    firms,
    contacts,
  }
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

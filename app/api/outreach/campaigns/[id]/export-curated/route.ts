/**
 * GET /api/outreach/campaigns/[id]/export-curated?format=xlsx|docx
 *
 * Streams either:
 *   - the 6-sheet curated workbook (Overview / Curated Profiles /
 *     LinkedIn DMs / Email Drafts / Methodology / Sender Brief)
 *   - the campaign brief DOCX
 *
 * Reads back the crawl results persisted on outreach_campaign_members.snapshot
 * by /curate-run, joined with the live crm_entries profile.  Sender
 * context is sourced from the user's default sender_profile when one
 * exists, or from query params on the export URL otherwise.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import {
  buildCuratedWorkbook, buildCuratedBrief, buildMessagesAll,
  type CurateMember, type CrawlResult, type SenderContext, type TieredCrawlOpts,
} from "@/lib/outreach/curate"

export const runtime = "nodejs"
export const maxDuration = 120

function safeFile(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").trim() || "campaign"
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    const url = new URL(req.url)
    const format = (url.searchParams.get("format") ?? "xlsx").toLowerCase()
    const tier1Deep = Number(url.searchParams.get("tier1Deep") ?? 30)
    const tier2Light = Number(url.searchParams.get("tier2Light") ?? 100)

    const [campaign] = await sql`
      SELECT * FROM outreach_campaigns WHERE id = ${id} AND user_id = ${user.id}
    ` as any[]
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

    const rows = await sql`
      SELECT m.id, m.crm_entry_id, m.status, m.snapshot,
             e.display_name, e.display_title, e.display_email, e.display_linkedin,
             e.display_location, e.display_type, e.display_score, e.display_tier,
             e.why_match, e.research_summary, e.research_url
      FROM outreach_campaign_members m
      LEFT JOIN crm_entries e ON e.id = m.crm_entry_id AND e.user_id = m.user_id
      WHERE m.campaign_id = ${id} AND m.user_id = ${user.id}
      ORDER BY e.display_score DESC NULLS LAST, m.added_at ASC
    `

    const members: CurateMember[] = (rows as any[]).map((r) => ({
      id: r.id,
      crmEntryId: r.crm_entry_id,
      displayName: r.display_name ?? "",
      displayTitle: r.display_title,
      displayEmail: r.display_email,
      displayLinkedin: r.display_linkedin,
      displayLocation: r.display_location,
      displayType: r.display_type,
      displayScore: r.display_score,
      displayTier: r.display_tier,
      whyMatch: r.why_match,
      researchSummary: r.research_summary,
      researchUrl: r.research_url,
      sectorsCsv: null,
      status: r.status,
    }))

    // Reconstruct the crawl map from each member's snapshot column.
    const crawls = new Map<string, CrawlResult>()
    for (const r of rows as any[]) {
      if (!r.snapshot) continue
      try {
        const snap = typeof r.snapshot === "string" ? JSON.parse(r.snapshot) : r.snapshot
        if (snap && typeof snap === "object" && "memberId" in snap) {
          crawls.set(r.id, snap as CrawlResult)
        }
      } catch {/* ignore malformed */}
    }

    // Sender context — prefer the user's default sender_profile.
    let sender: SenderContext = {}
    try {
      const [sp] = await sql`
        SELECT * FROM sender_profiles
        WHERE user_id = ${user.id} AND is_default = true
        ORDER BY updated_at DESC LIMIT 1
      ` as any[]
      if (sp) {
        const ps = (typeof sp.profile_set === "string" ? JSON.parse(sp.profile_set) : sp.profile_set) ?? {}
        sender = {
          founderName: ps.founderName ?? null,
          founderTitle: ps.founderTitle ?? null,
          founderLinkedin: ps.founderLinkedin ?? null,
          companyName: ps.companyName ?? null,
          companyUrl: ps.companyUrl ?? null,
          companyHq: ps.companyHq ?? null,
          oneLiner: ps.oneLiner ?? null,
          facts: Array.isArray(ps.facts) ? ps.facts : undefined,
          prioritySectors: Array.isArray(ps.prioritySectors) ? ps.prioritySectors : undefined,
          vehicle: ps.vehicle ?? undefined,
          target: ps.target ?? undefined,
          minimum: ps.minimum ?? undefined,
          calendarUrl: ps.calendarUrl ?? undefined,
        } as SenderContext
      }
    } catch {/* sender_profiles may not be migrated yet — defaults below */}

    // Last-resort fallbacks so the templates still render readably.
    sender.companyName = sender.companyName || "our team"
    sender.oneLiner = sender.oneLiner || "We commercialise early-stage opportunities through a hands-on operating model."

    const tierOpts: TieredCrawlOpts = { tier1Deep, tier2Light }

    if (format === "docx") {
      const buf = await buildCuratedBrief({
        campaignName: campaign.name,
        members,
        sender,
        tierOpts,
      })
      const filename = safeFile(`${campaign.name}-campaign-brief.docx`)
      return new NextResponse(buf as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      })
    }

    // Default: xlsx
    const messages = buildMessagesAll(members, sender)
    const buf = buildCuratedWorkbook({
      campaignName: campaign.name,
      members,
      crawls,
      messages,
      sender,
      tierOpts,
      generatedAt: new Date(),
    })
    const filename = safeFile(`${campaign.name}-curated.xlsx`)
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e: any) {
    console.error("[export-curated] error:", e)
    return NextResponse.json({ error: e?.message ?? "export failed" }, { status: 500 })
  }
}

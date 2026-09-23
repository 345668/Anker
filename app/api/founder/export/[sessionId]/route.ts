/**
 * Founder deliverable export for a persisted run (docs/architecture/14 §6).
 *
 *   ?format=xlsx                      → 6-sheet investor pipeline workbook (default)
 *   ?format=lists                     → ZIP of Excel lists, ≤ 200 rows each: firm groups, then independents
 *   ?format=csv&kind=groups|independents → one CSV (CRMs and sequencers import CSV)
 *   ?format=manifest                  → JSON: profile, provenance, totals, semantic status, exclusions
 *   ?format=methodology | outreach    → Markdown, or Word with &doc=docx
 */
import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { allResults, toMatchingResult } from "@/lib/matching/v2/founder-runs"
import { buildFounderWorkbook, workbookToBuffer } from "@/lib/matching/v2/founder-xlsx"
import { buildFounderMethodology, buildFounderOutreachPlan } from "@/lib/matching/v2/founder-report"
import { buildGroupLists, buildInvestorLists, LIST_SIZE } from "@/lib/matching/v2/pdf-pipeline"
import { markdownToDocxBuffer } from "@/lib/ai/docx-export"
import { zipFiles } from "@/lib/files/zip"
import { statusLabel } from "@/lib/email-verification/types"

export const runtime = "nodejs"
export const maxDuration = 120

async function respondAsDocOrMd(req: NextRequest, md: string, baseName: string) {
  const wantDocx = req.nextUrl.searchParams.get("doc") === "docx" || req.nextUrl.searchParams.get("format")?.endsWith("-docx")
  if (wantDocx) {
    const buf = await markdownToDocxBuffer(md, baseName)
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${baseName}.docx"` },
    })
  }
  return new NextResponse(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${baseName}.md"` } })
}

/** CSV cell: quoted, and a leading = + - @ neutralised so a spreadsheet cannot run it as a formula. */
function cell(v: unknown): string {
  let s = v == null ? "" : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}
const csv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n"

interface RouteCtx { params: Promise<{ sessionId: string }> }

export async function GET(req: NextRequest, ctx: RouteCtx) {
  try {
    const context = await matchingContext("founder")
    const { sessionId } = await ctx.params
    const format = req.nextUrl.searchParams.get("format") ?? "xlsx"
    const data = await allResults(sessionId, context)
    if (!data) return NextResponse.json({ error: "Run expired or not found. Re-run matching." }, { status: 404 })

    const result = toMatchingResult(data)
    const startup = data.run.startup
    const base = (startup.name || "startup").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "startup"

    if (format === "methodology") return await respondAsDocOrMd(req, buildFounderMethodology(result, startup), `${base}-methodology`)
    if (format === "outreach") return await respondAsDocOrMd(req, buildFounderOutreachPlan(result, startup), `${base}-outreach-plan`)

    if (format === "manifest") {
      return NextResponse.json({
        run: { id: data.run.id, createdAt: data.run.createdAt, engineVersion: data.run.engineVersion, options: data.run.options },
        profile: startup, totals: data.run.totals, semantic: data.run.semantic, exclusions: data.run.exclusions,
        tierCounts: data.run.tierCounts, funnel: data.run.funnel,
      }, { headers: { "Content-Disposition": `attachment; filename="${base}-run-manifest.json"` } })
    }

    if (format === "csv") {
      const kind = req.nextUrl.searchParams.get("kind") === "independents" ? "independents" : "groups"
      const body = kind === "groups"
        ? csv([["Rank", "Score", "Tier", "Firm", "Type", "Location", "Stages", "Sectors", "Why match", "Primary contact", "Title", "Email", "Email status", "LinkedIn", "Website", "Anker ID"],
          ...data.groups.map((g, i) => [i + 1, g.firm.score, g.firm.tier, g.firm.name, g.firm.type, g.firm.location, (g.firm.stages ?? []).join("; "), (g.firm.sectors ?? []).join("; "), g.firm.whyMatch,
            g.primary?.name ?? "", g.primary?.title ?? "", g.primary?.email ?? "", g.primary?.email ? statusLabel(g.primary.emailStatus) : "", g.primary?.linkedin ?? "", g.firm.website ?? "", `firm:${g.firm.id}`])])
        : csv([["Rank", "Score", "Tier", "Name", "Title", "Type", "Location", "Email", "Email status", "LinkedIn", "Sectors", "Why match", "Anker ID"],
          ...data.independents.map((p, i) => [i + 1, p.score, p.tier, p.name, p.title ?? "", p.type, p.location, p.email ?? "", p.email ? statusLabel(p.emailStatus) : "", p.linkedin ?? "", (p.sectors ?? []).join("; "), p.whyMatch, `contact:${p.id}`])])
      return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}-${kind}.csv"` } })
    }

    if (format === "lists") {
      const groupLists = buildGroupLists(result.groups ?? [], startup, LIST_SIZE)
      const indLists = buildInvestorLists("people", (result.independents ?? []) as any, startup, LIST_SIZE)
      const pad = (n: number, of: number) => String(n).padStart(String(of).length, "0")
      const files = [
        ...groupLists.map((f) => ({ name: `${base}-firm-groups-${pad(f.index, f.of)}-of-${f.of} (ranks ${f.firstRank}-${f.lastRank}).xlsx`, data: workbookToBuffer(f.workbook) })),
        ...indLists.map((f) => ({ name: `${base}-independents-${pad(f.index, f.of)}-of-${f.of} (ranks ${f.firstRank}-${f.lastRank}).xlsx`, data: workbookToBuffer(f.workbook) })),
        { name: `${base}-run-manifest.json`, data: Buffer.from(JSON.stringify({ run: data.run.id, createdAt: data.run.createdAt, engineVersion: data.run.engineVersion, totals: data.run.totals, semantic: data.run.semantic, exclusions: data.run.exclusions, profile: startup }, null, 2)) },
      ]
      return new NextResponse(new Uint8Array(zipFiles(files)), {
        headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${base}-investor-lists.zip"` },
      })
    }

    const buf = workbookToBuffer(buildFounderWorkbook(result, startup))
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}-investor-pipeline.xlsx"` },
    })
  } catch (error) { return matchingFailure(error, "Export is temporarily unavailable. Please retry.") }
}

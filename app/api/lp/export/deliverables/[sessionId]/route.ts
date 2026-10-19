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
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { loadSessionResult } from "@/lib/matching/lp/session-result"
import { markdownToDocxBuffer } from "@/lib/ai/docx-export"
import { buildPipelineWorkbook, workbookToBuffer, buildMethodologyMarkdown, buildMeetingAgendaMarkdown } from "@/lib/matching/v2"

export const runtime = "nodejs"

interface RouteCtx {
  params: Promise<{ sessionId: string }>
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  try {
  const { sessionId } = await ctx.params
  const format = req.nextUrl.searchParams.get("format") ?? "xlsx"
  const context = await matchingContext("vc")
  const loaded = await loadSessionResult(context.orgId, sessionId)
  if (!loaded) return NextResponse.json({ error: "Session not found in this workspace." }, { status: 404 })
  const { fund, result } = loaded

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
  } catch (error) { return matchingFailure(error, "Export is temporarily unavailable.") }
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

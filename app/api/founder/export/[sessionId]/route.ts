/**
 * Founder deliverable export.
 *
 *   ?format=xlsx          → 5-sheet investor pipeline workbook
 *   ?format=methodology   → markdown methodology
 *   ?format=outreach      → markdown 4-week outreach plan
 */

import { NextRequest, NextResponse } from "next/server"
import { getCachedSession } from "@/lib/matching/v2/founder-session-cache"
import { buildFounderWorkbook, workbookToBuffer } from "@/lib/matching/v2/founder-xlsx"
import {
  buildFounderMethodology,
  buildFounderOutreachPlan,
} from "@/lib/matching/v2/founder-report"
import { markdownToDocxBuffer } from "@/lib/ai/docx-export"

/**
 * Render either Markdown (?format=…) or Word (?format=…&doc=docx) depending
 * on the `doc` query param. Default is markdown — matches old links.
 */
async function respondAsDocOrMd(req: NextRequest, md: string, baseName: string) {
  const wantDocx =
    req.nextUrl.searchParams.get("doc") === "docx" ||
    req.nextUrl.searchParams.get("format")?.endsWith("-docx")
  if (wantDocx) {
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

export const runtime = "nodejs"

interface RouteCtx {
  params: Promise<{ sessionId: string }>
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { sessionId } = await ctx.params
  const format = req.nextUrl.searchParams.get("format") ?? "xlsx"

  const cached = getCachedSession(sessionId)
  if (!cached) {
    return NextResponse.json(
      { error: "Session expired or not found. Re-run matching." },
      { status: 404 },
    )
  }

  const { result, startup } = cached
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const base = slug(startup.name || "startup")

  if (format === "methodology") {
    const md = buildFounderMethodology(result, startup)
    return await respondAsDocOrMd(req, md, `${base}-methodology`)
  }
  if (format === "outreach") {
    const md = buildFounderOutreachPlan(result, startup)
    return await respondAsDocOrMd(req, md, `${base}-outreach-plan`)
  }

  const wb = buildFounderWorkbook(result, startup)
  const buf = workbookToBuffer(wb)
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}-investor-pipeline.xlsx"`,
    },
  })
}

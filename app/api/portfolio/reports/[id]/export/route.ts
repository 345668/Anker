/**
 * GET /api/portfolio/reports/[id]/export
 *
 * Returns the LP letter as a .docx download. Uses lib/ai/docx-export.ts'
 * markdownToDocxBuffer — same converter the matching reports use, which
 * already handles the subset of Markdown the generator produces (H1/H2/H3,
 * paragraphs, bullets, tables, bold/italic).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getReportById } from "@/lib/portfolio/lp-quarterly-report"
import { markdownToDocxBuffer } from "@/lib/ai/docx-export"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const report = await getReportById(id)
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!report.content_md) {
    return NextResponse.json({ error: "Report has no content to export" }, { status: 400 })
  }

  try {
    const buf = await markdownToDocxBuffer(report.content_md)
    const filename = `${report.fund_id}-${report.quarter_label}-LP-Letter.docx`
    // Buffer<ArrayBufferLike> isn't directly assignable to BodyInit in some
    // TS contexts — wrap as Uint8Array (which is).
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (e: any) {
    console.error("[portfolio/reports export]", e)
    return NextResponse.json({ error: e?.message ?? "Export failed" }, { status: 500 })
  }
}

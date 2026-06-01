/**
 * POST /api/admin/deep-research
 *   { target: string, hints?: string, maxPages?: number }
 *
 * Returns the dossier (Markdown) + provenance.  Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { deepResearch } from "@/lib/admin/deep-research"
import { markdownToDocxBuffer } from "@/lib/ai/docx-export"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const body = await req.json()
    const target = String(body?.target ?? "").trim()
    if (!target) return NextResponse.json({ error: "target required" }, { status: 400 })
    const result = await deepResearch({
      target,
      hints: body?.hints ? String(body.hints) : undefined,
      maxPages: Number(body?.maxPages) || undefined,
    })

    if (body?.format === "docx") {
      const buf = await markdownToDocxBuffer(result.dossierMarkdown, `Anker — ${target} dossier`)
      const safe = target.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase().slice(0, 60) || "dossier"
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${safe}-dossier.docx"`,
          "Cache-Control": "no-store",
        },
      })
    }

    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[admin/deep-research] error:", e)
    return NextResponse.json({ error: e?.message ?? "deep-research failed" }, { status: 500 })
  }
}

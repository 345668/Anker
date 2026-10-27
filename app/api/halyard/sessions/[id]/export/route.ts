import { NextRequest, NextResponse } from "next/server"
import { sessionContext, halyardFailure } from "@/lib/halyard/route"
import { exportMarkdown } from "@/lib/halyard/export"
import { markdownToDocxBuffer } from "@/lib/ai/docx-export"

export const runtime = "nodejs"
/** ?format=md (default) or docx; ?suggestions=1 adds the suggestions that were shown. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session } = await sessionContext((await params).id), q = req.nextUrl.searchParams
    const md = await exportMarkdown(session, { suggestions: q.get("suggestions") === "1" })
    const name = (session.title || "halyard-call").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "halyard-call"
    if (q.get("format") === "docx") return new NextResponse(new Uint8Array(await markdownToDocxBuffer(md, session.title || "Halyard call")), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${name}.docx"`, "Cache-Control": "no-store" } })
    return new NextResponse(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.md"`, "Cache-Control": "no-store" } })
  } catch (e) { return halyardFailure(e) }
}

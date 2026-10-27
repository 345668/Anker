import { NextRequest, NextResponse } from "next/server"
import { viewContext, halyardFailure } from "@/lib/halyard/route"
import { exportMarkdown } from "@/lib/halyard/export"
import { markdownToDocxBuffer } from "@/lib/ai/docx-export"
import { markdownToPdf } from "@/lib/halyard/pdf"

export const runtime = "nodejs"
/** ?format=md (default), docx or pdf; ?suggestions=1 adds the suggestions that were shown. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, role } = await viewContext((await params).id), q = req.nextUrl.searchParams
    // A colleague the call was shared with gets the call and the notes, not the owner's suggestions or outgoing email draft.
    const md = await exportMarkdown(session, { suggestions: role === "owner" && q.get("suggestions") === "1", includeEmail: role === "owner" })
    const name = (session.title || "halyard-call").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "halyard-call"
    if (q.get("format") === "docx") return new NextResponse(new Uint8Array(await markdownToDocxBuffer(md, session.title || "Halyard call")), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${name}.docx"`, "Cache-Control": "no-store" } })
    if (q.get("format") === "pdf") return new NextResponse(new Uint8Array(await markdownToPdf(md, session.title || "Halyard call")), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "no-store" } })
    return new NextResponse(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.md"`, "Cache-Control": "no-store" } })
  } catch (e) { return halyardFailure(e) }
}

import { NextRequest, NextResponse } from "next/server"
import { verifyAccessGrant, getFounderDocument, logDocumentView } from "@/lib/portfolio/data-room"

export const runtime = "nodejs"
export const maxDuration = 60

/** GET — serve a founder-room document to a token-holding investor, and log
 *  the view (viewer = grantee email). No account required. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await ctx.params
  const grant = await verifyAccessGrant(token)
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const doc = await getFounderDocument(docId, grant.company_id)
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // View tracking — the investor's email + which doc. (Company scope is derived
  // via the doc join in getFounderViewStats / getFounderRecentViews.)
  await logDocumentView({ documentId: doc.id, viewerEmail: grant.grantee_email, isLp: false })

  try {
    const { get } = await import("@vercel/blob")
    const result = await get(doc.file_url, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN } as any)
    if (!result) return NextResponse.json({ error: "File not found" }, { status: 404 })
    return new NextResponse((result as any).stream as any, {
      headers: {
        "Content-Type": doc.content_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${(doc.file_name || doc.title).replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch {
    return NextResponse.redirect(doc.file_url)
  }
}

/**
 * GET /api/portfolio/deal-documents/[docId] — admin-gated data-room download.
 *
 * Deal documents live in the PRIVATE Blob store, so their URLs aren't publicly
 * fetchable. This route authenticates the admin, loads the document row,
 * fetches the blob with the store token, and STREAMS it back (streaming keeps
 * large files under Vercel's buffered-response limits).
 *
 * ?download=1 forces a download disposition; otherwise inline.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getDocument } from "@/lib/portfolio/deal-documents"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: NextRequest, ctx: { params: Promise<{ docId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { docId } = await ctx.params

  const doc = await getDocument(docId)
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })

  const forceDownload = new URL(req.url).searchParams.get("download") === "1"
  const disposition = forceDownload ? "attachment" : "inline"
  const safeName = (doc.name || "document").replace(/["\\\r\n]/g, "")

  try {
    const { get, head } = await import("@vercel/blob")
    let stream: ReadableStream | null = null
    let contentType = doc.content_type ?? "application/octet-stream"
    try {
      const result: any = await get(doc.blob_path, {
        access: "private",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      })
      if (result?.stream) {
        stream = result.stream
        contentType = result.contentType ?? contentType
      }
    } catch {
      // Fall back to head() + downloadUrl for SDK variants without get().
    }
    if (!stream) {
      const meta: any = await head(doc.blob_path, { token: process.env.BLOB_READ_WRITE_TOKEN })
      const dl = meta?.downloadUrl ?? meta?.url ?? doc.blob_path
      const resp = await fetch(dl)
      if (!resp.ok || !resp.body) return NextResponse.json({ error: "Document not found" }, { status: 404 })
      stream = resp.body
      contentType = meta?.contentType ?? resp.headers.get("content-type") ?? contentType
    }
    return new NextResponse(stream as any, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename="${safeName}"`,
        "Cache-Control": "private, max-age=300",
      },
    })
  } catch (e: any) {
    console.error("[deal doc proxy]", e)
    return NextResponse.json({ error: "Could not load document" }, { status: 502 })
  }
}

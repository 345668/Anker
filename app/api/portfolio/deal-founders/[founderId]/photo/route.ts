/**
 * GET /api/portfolio/deal-founders/[founderId]/photo — admin-gated headshot.
 *
 * Founder photos live in the PRIVATE Blob store, so their URLs aren't publicly
 * fetchable. This route authenticates the admin, loads the founder, fetches
 * the blob with the store token, and streams it back.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFounder } from "@/lib/portfolio/deal-founders"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(_req: NextRequest, ctx: { params: Promise<{ founderId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { founderId } = await ctx.params

  const founder = await getFounder(founderId)
  if (!founder || !founder.photo_url) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 })
  }

  try {
    const { get, head } = await import("@vercel/blob")
    let stream: ReadableStream | null = null
    let contentType = "image/jpeg"
    try {
      const result: any = await get(founder.photo_url, {
        access: "private",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      })
      if (result?.stream) {
        stream = result.stream
        contentType = result.contentType ?? contentType
      }
    } catch {
      // Fall back to head() + downloadUrl fetch for SDK variants without get().
    }
    if (!stream) {
      const meta: any = await head(founder.photo_url, { token: process.env.BLOB_READ_WRITE_TOKEN })
      const dl = meta?.downloadUrl ?? meta?.url ?? founder.photo_url
      const resp = await fetch(dl)
      if (!resp.ok || !resp.body) return NextResponse.json({ error: "Photo not found" }, { status: 404 })
      stream = resp.body
      contentType = meta?.contentType ?? resp.headers.get("content-type") ?? contentType
    }
    return new NextResponse(stream as any, {
      headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=300" },
    })
  } catch (e: any) {
    console.error("[founder photo proxy]", e)
    return NextResponse.json({ error: "Could not load photo" }, { status: 502 })
  }
}

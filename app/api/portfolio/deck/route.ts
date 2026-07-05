/**
 * GET /api/portfolio/deck?src=<blob-url> — admin-gated pitch-deck viewer.
 *
 * Pitch decks live in a PRIVATE Vercel Blob store (they're confidential),
 * so their URLs aren't publicly fetchable. This route authenticates the
 * admin, validates the URL points at our store's pitch-decks/ prefix,
 * fetches the blob with the store token, and STREAMS it back — streaming
 * keeps 25 MB decks under Vercel's buffered-response limits.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard

  const src = new URL(req.url).searchParams.get("src")
  if (!src) return NextResponse.json({ error: "src required" }, { status: 400 })

  let target: URL
  try {
    target = new URL(src)
  } catch {
    return NextResponse.json({ error: "Invalid src" }, { status: 400 })
  }
  if (!target.hostname.endsWith(".blob.vercel-storage.com") || !target.pathname.includes("pitch-decks/")) {
    return NextResponse.json({ error: "Invalid src" }, { status: 400 })
  }

  try {
    const { get } = await import("@vercel/blob")
    const result = await get(src, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    if (!result) return NextResponse.json({ error: "Deck not found" }, { status: 404 })
    return new NextResponse(result.stream as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${target.pathname.split("/").pop() ?? "deck.pdf"}"`,
        "Cache-Control": "private, max-age=300",
      },
    })
  } catch (e: any) {
    console.error("[deck proxy]", e)
    return NextResponse.json({ error: "Could not load deck" }, { status: 502 })
  }
}

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
  // Decks live under two prefixes: pitch-decks/ (legacy /pitch intake) and
  // founder-submissions/ (the /apply campaign engine).
  const okHost = target.hostname.endsWith(".blob.vercel-storage.com")
  const okPath = target.pathname.includes("pitch-decks/") || target.pathname.includes("founder-submissions/")
  if (!okHost || !okPath) {
    return NextResponse.json({ error: "Invalid src" }, { status: 400 })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return NextResponse.json({ error: "Blob storage not configured" }, { status: 503 })

  try {
    // Private Vercel Blob objects are served only with the store token as a
    // Bearer header (the SDK get()/downloadUrl path returns 403 on this store).
    const upstream = await fetch(src, { headers: { authorization: `Bearer ${token}` } })
    if (!upstream.ok || !upstream.body) {
      console.error("[deck proxy] upstream", upstream.status)
      return NextResponse.json({ error: "Deck not found" }, { status: upstream.status === 404 ? 404 : 502 })
    }
    return new NextResponse(upstream.body as any, {
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

/**
 * GET /api/portfolio/data-room/[docId]/file
 *
 * Entitlement-checked download for fund data-room documents. Serves BOTH
 * audiences and BOTH storage eras:
 *
 *   Auth
 *   ────
 *     - Admins (isAdminUser) can stream any document.
 *     - Otherwise the caller must be an LP entitled to the doc, resolved via
 *       their Supabase email → fund_lps membership → getDocumentForLp.
 *
 *   Storage
 *   ───────
 *     - Legacy docs uploaded with public access (or the local-dev
 *       public/data-room/ fallback) → 302 redirect to the stored URL.
 *     - New docs in the PRIVATE Blob store → streamed with the store token
 *       (their URLs aren't publicly fetchable). Streaming keeps large files
 *       under Vercel's buffered-response limit.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import {
  getDocumentById, getDocumentForLp, getLpMembershipsForEmail,
  type DataRoomDocumentWithScope,
} from "@/lib/portfolio/data-room"

export const runtime = "nodejs"
export const maxDuration = 60

/** A stored file_url that is NOT in the private Blob store — serve by redirect. */
function isLegacyPublicUrl(url: string): boolean {
  // Local-dev fallback path.
  if (url.startsWith("/")) return true
  try {
    const u = new URL(url)
    // Public Blob store hostnames carry the ".public." segment; private ones
    // do not. Anything not on our blob host (e.g. an external link) is also
    // treated as a plain redirect.
    if (u.hostname.endsWith(".public.blob.vercel-storage.com")) return true
    if (!u.hostname.endsWith(".blob.vercel-storage.com")) return true
    return false
  } catch {
    return true
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ docId: string }> }) {
  const { docId } = await ctx.params

  // ── Authorise ──────────────────────────────────────────────────────────
  let doc: DataRoomDocumentWithScope | null = null
  const admin = await isAdminUser()
  if (admin.isAdmin) {
    doc = await getDocumentById(docId)
  } else {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
    const memberships = await getLpMembershipsForEmail(user.email ?? "")
    // getDocumentForLp returns null when the doc is missing OR not entitled —
    // both collapse to a 404 so we don't leak the existence of other funds' docs.
    doc = await getDocumentForLp(docId, memberships)
  }
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const fileName = doc.file_name || `${doc.title || "document"}`
  const contentType = doc.content_type || "application/octet-stream"

  // ── Legacy public / external / local → redirect ────────────────────────
  if (isLegacyPublicUrl(doc.file_url)) {
    return NextResponse.redirect(doc.file_url)
  }

  // ── Private Blob → stream with the store token ─────────────────────────
  try {
    const { get } = await import("@vercel/blob")
    const result = await get(doc.file_url, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    if (!result) return NextResponse.json({ error: "File not found" }, { status: 404 })
    return new NextResponse(result.stream as any, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    })
  } catch (e: any) {
    console.error("[data-room file]", e)
    return NextResponse.json({ error: "Could not load file" }, { status: 502 })
  }
}

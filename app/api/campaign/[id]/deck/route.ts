/**
 * POST /api/campaign/[id]/deck  — admin: attach or replace a submission's deck.
 *
 * For when the founder's deck is missing/unreadable, or the admin has a better
 * copy. Points deck_blob_key at the private Blob URL. Does NOT re-assess
 * automatically — the admin follows up with "Re-assess" so they stay in control.
 *
 * Three request shapes, one route, because the hosted request limit (~4.5 MB)
 * made the original multipart-only upload fail for real decks (docs/architecture/36):
 *   • client-upload handshake (JSON { type: "blob.generate-client-token" … }): the
 *     browser then uploads straight to Blob, under this submission's own folder;
 *   • { blobUrl }: record a blob the browser uploaded, after checking it is ours,
 *     in this submission's folder, and exists;
 *   • multipart { deck }: kept for small files and older callers (≤ 4 MB).
 * The Blob completion webhook carries no session; handleUpload verifies its
 * signature, and nothing is done on completion, so it is the only unguarded branch.
 */
import { NextRequest, NextResponse } from "next/server"
import { handleUpload } from "@vercel/blob/client"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { DECK_TYPES, MAX_FILE_BYTES, deckPrefix, isDeckBlobUrl } from "@/lib/campaign/submission-files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const INLINE_MAX = 4 * 1024 * 1024

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const multipart = (req.headers.get("content-type") ?? "").includes("multipart/form-data")
  const json = multipart ? null : ((await req.json().catch(() => null)) as any)

  // Completion webhook: signature-verified inside handleUpload, no admin session.
  if (json?.type === "blob.upload-completed") {
    try {
      return NextResponse.json(await handleUpload({ body: json, request: req, onBeforeGenerateToken: async () => ({}), onUploadCompleted: async () => {} }))
    } catch { return NextResponse.json({ error: "Invalid callback." }, { status: 400 }) }
  }

  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const rows = await sql`SELECT public_ref FROM founder_submissions WHERE id=${id} LIMIT 1`
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const publicRef = (rows[0] as any).public_ref as string

  if (json?.type === "blob.generate-client-token") {
    try {
      return NextResponse.json(await handleUpload({
        body: json,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith(deckPrefix(publicRef))) throw new Error("Upload path not allowed.")
          return { allowedContentTypes: DECK_TYPES, maximumSizeInBytes: MAX_FILE_BYTES, addRandomSuffix: true, validUntil: Date.now() + 10 * 60_000 }
        },
        onUploadCompleted: async () => {},
      }))
    } catch { return NextResponse.json({ error: "The upload could not be authorised." }, { status: 400 }) }
  }

  if (json && typeof json.blobUrl === "string") {
    if (!isDeckBlobUrl(json.blobUrl, publicRef)) return NextResponse.json({ error: "That upload does not belong to this application." }, { status: 403 })
    const { head } = await import("@vercel/blob")
    const meta = await head(json.blobUrl).catch(() => null)
    if (!meta) return NextResponse.json({ error: "The uploaded file could not be found. Attach it again." }, { status: 400 })
    if (meta.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File exceeds 25 MB." }, { status: 413 })
    await sql`UPDATE founder_submissions SET deck_blob_key=${json.blobUrl}, updated_at=NOW() WHERE id=${id}`
    return NextResponse.json({ ok: true, deckUrl: json.blobUrl, hint: "Deck attached. Click Re-assess to run the pipeline with it." })
  }

  // Multipart, small files only.
  const form = multipart ? await req.formData().catch(() => null) : null
  const file = form?.get("deck")
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Attach a PDF or PowerPoint file." }, { status: 400 })
  if (file.size > INLINE_MAX) return NextResponse.json({ error: "Large decks are uploaded directly; reload the page and try again." }, { status: 413 })

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token && !process.env.VERCEL) return NextResponse.json({ error: "Blob storage not configured." }, { status: 503 })
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "deck.pdf"
  const { put } = await import("@vercel/blob")
  const res = await put(`${deckPrefix(publicRef)}deck-admin-${Date.now()}-${safe}`, Buffer.from(await file.arrayBuffer()), {
    access: "private", contentType: file.type || "application/pdf", addRandomSuffix: false, token,
  })
  await sql`UPDATE founder_submissions SET deck_blob_key=${res.url}, updated_at=NOW() WHERE id=${id}`
  return NextResponse.json({ ok: true, deckUrl: res.url, hint: "Deck attached. Click Re-assess to run the pipeline with it." })
}

/**
 * POST /api/campaign/[id]/deck  — admin: attach or replace a submission's deck.
 *
 * For when the founder's deck is missing/unreadable, or the admin has a better
 * copy. Uploads to the private Blob store and points deck_blob_key at the full
 * URL. Does NOT re-assess automatically — the admin follows up with "Re-assess"
 * so they stay in control.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX = 25 * 1024 * 1024

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params

  const rows = await sql`SELECT public_ref FROM founder_submissions WHERE id=${id} LIMIT 1`
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const publicRef = (rows[0] as any).public_ref

  const form = await req.formData().catch(() => null)
  const file = form?.get("deck")
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach a PDF or PowerPoint file." }, { status: 400 })
  }
  if (file.size > MAX) return NextResponse.json({ error: "File exceeds 25 MB." }, { status: 413 })

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token && !process.env.VERCEL) {
    return NextResponse.json({ error: "Blob storage not configured." }, { status: 503 })
  }

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "deck.pdf"
  const { put } = await import("@vercel/blob")
  const buf = Buffer.from(await file.arrayBuffer())
  const res = await put(`founder-submissions/${publicRef}/deck-admin-${Date.now()}-${safe}`, buf, {
    access: "private",
    contentType: file.type || "application/pdf",
    addRandomSuffix: false,
    token,
  })

  await sql`UPDATE founder_submissions SET deck_blob_key=${res.url}, updated_at=NOW() WHERE id=${id}`
  return NextResponse.json({ ok: true, deckUrl: res.url, hint: "Deck attached. Click Re-assess to run the pipeline with it." })
}

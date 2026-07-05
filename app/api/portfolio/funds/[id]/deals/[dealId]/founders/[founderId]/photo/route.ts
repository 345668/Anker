/**
 * POST /api/portfolio/funds/[id]/deals/[dealId]/founders/[founderId]/photo
 *   FormData: file (image, ≤4 MB)
 *
 * Uploads a founder headshot to the PRIVATE Blob store (server-side put —
 * headshots are small, well under the 4.5 MB serverless body limit) and
 * stores the blob URL on the founder. The image is served back through the
 * streaming route /api/portfolio/deal-founders/[founderId]/photo.
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getDealById } from "@/lib/portfolio/deal-pipeline"
import { getFounder, updateFounder } from "@/lib/portfolio/deal-founders"

export const runtime = "nodejs"
export const maxDuration = 60

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"])
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }
const MAX_BYTES = 4 * 1024 * 1024
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const trimmed = slugOrId.trim()
  if (!trimmed) return null
  const fund = UUID_RE.test(trimmed)
    ? (await getFundById(trimmed)) ?? (await getFundBySlug(trimmed))
    : await getFundBySlug(trimmed)
  return fund?.id ?? null
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; dealId: string; founderId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, dealId, founderId } = await ctx.params

  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const deal = await getDealById(dealId)
  if (!deal || deal.fund_id !== fundId) return NextResponse.json({ error: "Deal not found" }, { status: 404 })
  const founder = await getFounder(founderId)
  if (!founder || founder.deal_id !== dealId) return NextResponse.json({ error: "Founder not found" }, { status: 404 })

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Photo uploads are not configured (no Blob store)." }, { status: 503 })
  }

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 }) }
  const file = form.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 })

  const mime = (file.type || "").toLowerCase()
  if (!ALLOWED.has(mime)) return NextResponse.json({ error: "Photo must be PNG, JPEG, or WebP." }, { status: 415 })
  if (file.size <= 0) return NextResponse.json({ error: "Empty file" }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Photo too large (max ${MAX_BYTES / 1024 / 1024} MB).` }, { status: 413 })
  }

  try {
    const { put } = await import("@vercel/blob")
    const bytes = Buffer.from(await file.arrayBuffer())
    const blob = await put(`deal-founders/${dealId}/${randomUUID().slice(0, 12)}.${EXT[mime]}`, bytes, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: mime,
      addRandomSuffix: true,
    })
    const updated = await updateFounder(founderId, { photoUrl: blob.url })
    return NextResponse.json({ founder: updated })
  } catch (e: any) {
    console.error("[founder photo upload]", e)
    return NextResponse.json({ error: e?.message ?? "Photo upload failed" }, { status: 502 })
  }
}

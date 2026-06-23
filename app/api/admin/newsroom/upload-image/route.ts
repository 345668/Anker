/**
 * POST /api/admin/newsroom/upload-image
 *
 *   FormData: file (image/png, image/jpeg, image/webp, image/avif, image/gif)
 *
 *   Response: { url: string, contentType: string, size: number }
 *
 * Storage backend
 * ───────────────
 * - When BLOB_READ_WRITE_TOKEN is set (production / Vercel preview), we use
 *   @vercel/blob `put()` with `access: "public"`. This is the same backend
 *   that lib/assistant/artifact.ts uses for assistant tool outputs, so the
 *   newsroom doesn't introduce a second storage path.
 *
 * - When the token isn't present (local dev, standalone Node), we fall back
 *   to writing under `public/newsroom-images/` so Next's static handler can
 *   serve them at `/newsroom-images/<file>`. This means local-dev uploads are
 *   gitignored (`public/newsroom-images/.gitkeep` is in the repo but the
 *   actual files are not).
 *
 * Validation
 * ──────────
 *   - Whitelist of MIME types (we don't want anyone uploading PDFs or SVGs
 *     to the public images endpoint).
 *   - Max 5 MB.  Hero images don't need to be bigger; if they are we'd
 *     rather force the admin to compress first than ship a slow article.
 *
 * Admin-gated via requireAdmin().
 */
import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { requireAdmin } from "@/lib/auth/require-admin"

export const runtime = "nodejs"
export const maxDuration = 60

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/avif",
  "image/gif",
])

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

const EXT_FROM_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard

  let form: FormData
  try {
    form = await req.formData()
  } catch (e: any) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 })
  }

  const mime = (file.type || "").toLowerCase()
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: `Unsupported type ${mime || "(unknown)"}. Allowed: png, jpg, webp, avif, gif.` },
      { status: 415 },
    )
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Max 5 MB.` },
      { status: 413 },
    )
  }

  const ext = EXT_FROM_MIME[mime] ?? "bin"
  const id = randomUUID().slice(0, 12)
  const filename = `${id}.${ext}`
  const bytes = Buffer.from(await file.arrayBuffer())

  // Vercel Blob path — production + Vercel preview deploys.
  //
  // The Blob store is configured with PRIVATE access, so we upload with
  // access:"private" (uploading "public" to a private store throws) and return
  // a stable public-serving URL (/api/newsroom/images/<file>) that streams the
  // image back to anyone viewing the article — no auth required for reads.
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (blobToken) {
    try {
      const { put } = await import("@vercel/blob")
      await put(`newsroom-images/${filename}`, bytes, {
        access: "private",
        token: blobToken,
        contentType: mime,
        // Disable random suffix — we already use a UUID so the URL is stable.
        addRandomSuffix: false,
      })
      return NextResponse.json({
        url: `/api/newsroom/images/${filename}`,
        contentType: mime,
        size: file.size,
        backend: "vercel-blob",
      })
    } catch (e: any) {
      console.error("[newsroom upload-image] Blob put failed", e)
      return NextResponse.json(
        { error: e?.message ?? "Blob upload failed" },
        { status: 502 },
      )
    }
  }

  // Local dev fallback — write to public/newsroom-images/.
  try {
    const dir = path.join(process.cwd(), "public", "newsroom-images")
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, filename)
    await fs.writeFile(filePath, bytes)
    return NextResponse.json({
      url: `/newsroom-images/${filename}`,
      contentType: mime,
      size: file.size,
      backend: "local",
    })
  } catch (e: any) {
    console.error("[newsroom upload-image] local fs write failed", e)
    return NextResponse.json(
      { error: e?.message ?? "Local file write failed" },
      { status: 500 },
    )
  }
}

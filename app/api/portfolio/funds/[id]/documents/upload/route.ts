/**
 * POST /api/portfolio/funds/[id]/documents/upload
 *
 *   FormData: file (any binary, ≤25 MB)
 *
 *   Returns: { url, fileName, contentType, byteSize, backend }
 *
 * Storage backend
 * ───────────────
 *   - BLOB_READ_WRITE_TOKEN set → @vercel/blob put() with private access.
 *     Data-room docs are sensitive (subscription agreements, K-1s); we use
 *     access:"public" with random suffix as a stop-gap until we wire signed
 *     URLs. (TODO: switch to signed URLs in a follow-up.)
 *   - Otherwise → public/data-room/ on disk, served by Next static handler.
 *
 * Validation
 * ──────────
 *   - 25 MB cap.  Anything bigger is probably a video and shouldn't live
 *     in the data room.
 *   - Whitelist of MIME types so we don't accidentally serve executables.
 *
 * Admin-gated.  The DB row creation is a separate POST to /documents — we
 * return the URL here so the admin UI can also let the user fill title /
 * category / scope before the row lands.
 */
import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { requireAdmin } from "@/lib/auth/require-admin"

export const runtime = "nodejs"
export const maxDuration = 120

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",   // .docx
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",         // .xlsx
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "text/plain", "text/markdown", "text/csv",
  "image/png", "image/jpeg", "image/webp",
  "application/zip",
])
const MAX_BYTES = 25 * 1024 * 1024

const EXT_FROM_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/zip": "zip",
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id: fundIdOrSlug } = await ctx.params

  let form: FormData
  try { form = await req.formData() }
  catch { return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 }) }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 })
  }

  const mime = (file.type || "application/octet-stream").toLowerCase()
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: `Unsupported type ${mime}. Allowed: PDF, Office docs, text, common images, zip.` },
      { status: 415 },
    )
  }
  if (file.size <= 0) return NextResponse.json({ error: "Empty file" }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Max 25 MB.` },
      { status: 413 },
    )
  }

  const ext = EXT_FROM_MIME[mime] ?? "bin"
  const id = randomUUID().slice(0, 12)
  // Prefix the path with the fund slug/id so blob listing in the Vercel
  // dashboard is organised; doesn't grant per-fund access on its own.
  const safeFundKey = String(fundIdOrSlug).replace(/[^a-z0-9._-]/gi, "")
  const filename = `${id}.${ext}`
  const blobPath = `data-room/${safeFundKey}/${filename}`
  const bytes = Buffer.from(await file.arrayBuffer())

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (blobToken) {
    try {
      const { put } = await import("@vercel/blob")
      const blob = await put(blobPath, bytes, {
        access: "public",
        token: blobToken,
        contentType: mime,
        addRandomSuffix: true,  // keep URLs unguessable as a stopgap
      })
      return NextResponse.json({
        url: blob.url,
        fileName: file.name,
        contentType: mime,
        byteSize: file.size,
        backend: "vercel-blob",
      })
    } catch (e: any) {
      console.error("[data-room upload] Blob put failed", e)
      return NextResponse.json({ error: e?.message ?? "Blob upload failed" }, { status: 502 })
    }
  }

  // Local dev fallback
  try {
    const dir = path.join(process.cwd(), "public", "data-room", safeFundKey)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, filename), bytes)
    return NextResponse.json({
      url: `/data-room/${safeFundKey}/${filename}`,
      fileName: file.name,
      contentType: mime,
      byteSize: file.size,
      backend: "local",
    })
  } catch (e: any) {
    console.error("[data-room upload] local fs write failed", e)
    return NextResponse.json({ error: e?.message ?? "Local file write failed" }, { status: 500 })
  }
}

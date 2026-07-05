/**
 * GET /api/newsroom/images/<file>
 *
 * Public read endpoint for newsroom hero/inline images.
 *
 * Images are uploaded by admins to a PRIVATE Vercel Blob store
 * (see app/api/admin/newsroom/upload-image/route.ts). Private blobs cannot be
 * opened via their raw URL, so this route streams them back to anyone viewing
 * an article. No auth — these are intended to be publicly visible.
 *
 * Falls back to public/newsroom-images/<file> for local-dev uploads.
 */
import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "node:fs"
import path from "node:path"

export const runtime = "nodejs"

const CONTENT_TYPE: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
}
const ALLOWED_EXT = new Set(Object.keys(CONTENT_TYPE))

export async function GET(_req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params
  // Hard sanitisation: basename only, no traversal.
  const safe = path.basename(file ?? "")
  const ext = path.extname(safe).toLowerCase()
  if (!safe || safe !== file || !ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const blobPath = `newsroom-images/${safe}`
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (blobToken) {
    // 1a) Stream directly via get() — preferred.
    try {
      const { get } = await import("@vercel/blob")
      const result = await get(blobPath, { access: "private", useCache: false, token: blobToken })
      if (result?.stream) {
        return new NextResponse(result.stream as any, {
          status: 200,
          headers: {
            "Content-Type": result.blob?.contentType ?? CONTENT_TYPE[ext] ?? "application/octet-stream",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        })
      }
    } catch (e: any) {
      console.warn("[newsroom images] blob get() failed, trying head()+downloadUrl:", e?.message)
    }

    // 1b) Fallback: resolve a signed downloadUrl via head() and proxy the bytes.
    try {
      const { head } = await import("@vercel/blob")
      const meta = await head(blobPath, { token: blobToken })
      const dl = (meta as any)?.downloadUrl || (meta as any)?.url
      if (dl) {
        const upstream = await fetch(dl)
        if (upstream.ok && upstream.body) {
          return new NextResponse(upstream.body as any, {
            status: 200,
            headers: {
              "Content-Type": (meta as any)?.contentType ?? CONTENT_TYPE[ext] ?? "application/octet-stream",
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          })
        }
      }
    } catch (e: any) {
      console.warn("[newsroom images] blob head() fallback failed, trying disk:", e?.message)
    }
  }

  // 2) Local dev fallback — public/newsroom-images/<file>.
  try {
    const filePath = path.join(process.cwd(), "public", "newsroom-images", safe)
    const bytes = await fs.readFile(filePath)
    return new NextResponse(bytes as any, {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPE[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch {
    return NextResponse.json({ error: "Image not found" }, { status: 404 })
  }
}

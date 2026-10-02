/**
 * POST /api/public/submit/upload — PUBLIC client-upload token for founder applications
 * (lib/campaign/submission-files.ts). Anonymous by design, so: rate limited per IP, a fixed
 * path prefix, document types only, 25 MB, ten minutes, random suffix.
 */
import { NextRequest, NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { DATA_ROOM_TYPES, MAX_FILE_BYTES, PENDING_PREFIX } from "@/lib/campaign/submission-files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// A deck plus up to eight data-room files is nine tokens for one honest application.
const TOKEN_LIMIT = { limit: 30, windowMs: 60 * 60_000 }

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "0.0.0.0"
  const rl = rateLimit(`public-submit-upload:${createHash("sha256").update(ip + (process.env.IP_HASH_SALT || "anker")).digest("hex").slice(0, 32)}`, TOKEN_LIMIT)
  if (!rl.ok) return rateLimitResponse(rl)
  try {
    const body = (await req.json()) as HandleUploadBody
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(PENDING_PREFIX)) throw new Error("Upload path not allowed.")
        return { allowedContentTypes: DATA_ROOM_TYPES, maximumSizeInBytes: MAX_FILE_BYTES, addRandomSuffix: true, validUntil: Date.now() + 10 * 60_000 }
      },
      onUploadCompleted: async () => { /* the submission row records the URL */ },
    })
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "The upload could not be authorised." }, { status: 400 })
  }
}

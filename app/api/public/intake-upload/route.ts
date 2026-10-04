/**
 * POST /api/public/intake-upload — PUBLIC client-upload token for fund intake decks (docs/architecture/39).
 * Anonymous by design, so: rate limited per IP, fixed path prefix, deck types only, 100 MB, ten minutes, random suffix.
 */
import { NextRequest, NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { INTAKE_DECK_TYPES, INTAKE_MAX_BYTES, INTAKE_PENDING_PREFIX } from "@/lib/intake/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TOKEN_LIMIT = { limit: 10, windowMs: 60 * 60_000 }

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "0.0.0.0"
  const rl = rateLimit(`intake-upload:${createHash("sha256").update(ip + (process.env.IP_HASH_SALT || "anker")).digest("hex").slice(0, 32)}`, TOKEN_LIMIT)
  if (!rl.ok) return rateLimitResponse(rl)
  try {
    const body = (await req.json()) as HandleUploadBody
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(INTAKE_PENDING_PREFIX)) throw new Error("Upload path not allowed.")
        return { allowedContentTypes: INTAKE_DECK_TYPES, maximumSizeInBytes: INTAKE_MAX_BYTES, addRandomSuffix: true, validUntil: Date.now() + 15 * 60_000 }
      },
      onUploadCompleted: async () => { /* the submission row records the URL */ },
    })
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: "The upload could not be authorised." }, { status: 400 })
  }
}

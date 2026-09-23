/**
 * POST /api/founder/deck-upload — client-upload token for decks above the 4 MB
 * request limit (docs/architecture/14 §8). The browser uploads straight to
 * Vercel Blob with PRIVATE access; extraction reads the blob server-side and
 * deletes it. Tokens are bound to this workspace's prefix, its file types and
 * a 25 MB ceiling.
 */
import { NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { matchingContext, matchingFailure, MatchingError } from "@/lib/matching/access"
import { blobPrefix } from "@/lib/matching/deck-upload-server"
import { MAX_BLOB_BYTES } from "@/lib/matching/deck-upload"

export const runtime = "nodejs"

const TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]

export async function POST(req: NextRequest) {
  try {
    const context = await matchingContext("founder")
    const body = (await req.json()) as HandleUploadBody
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(blobPrefix(context.orgId))) throw new MatchingError("Upload path not allowed.", 403)
        return {
          allowedContentTypes: TYPES,
          maximumSizeInBytes: MAX_BLOB_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60_000,
        }
      },
      onUploadCompleted: async () => { /* extraction reads and deletes the blob */ },
    })
    return NextResponse.json(result)
  } catch (error) { return matchingFailure(error, "The upload could not be authorised.") }
}

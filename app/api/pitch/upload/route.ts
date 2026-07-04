/**
 * POST /api/pitch/upload — token broker for CLIENT-SIDE deck uploads.
 *
 * Why: Vercel serverless functions reject request bodies over ~4.5 MB
 * with a 413 at the platform edge — decks routinely exceed that. The
 * /pitch page therefore uploads the file DIRECTLY from the browser to
 * Vercel Blob using @vercel/blob/client; this route only authorizes
 * the upload (it never sees the file bytes).
 *
 * Guardrails (public route):
 *   - pathname is forced under pitch-decks/
 *   - PDF only, 15 MB cap
 *   - random suffix on, so URLs are unguessable
 *
 * Requires a Blob store on the Vercel project (BLOB_READ_WRITE_TOKEN).
 */
import { NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"

export const runtime = "nodejs"

const MAX_DECK_BYTES = 15 * 1024 * 1024

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Deck uploads are not configured on this deployment (no Blob store)." },
      { status: 503 },
    )
  }
  try {
    const body = (await req.json()) as HandleUploadBody
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("pitch-decks/")) {
          throw new Error("Invalid upload path.")
        }
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_DECK_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ kind: "pitch-deck" }),
        }
      },
      onUploadCompleted: async ({ blob }) => {
        console.log(`[pitch/upload] deck stored: ${blob.pathname}`)
      },
    })
    return NextResponse.json(json)
  } catch (e: any) {
    console.error("[pitch/upload]", e)
    return NextResponse.json({ error: e?.message ?? "Upload authorization failed" }, { status: 400 })
  }
}

/**
 * POST /api/portfolio/funds/[id]/deals/[dealId]/documents/upload
 *   Token broker for CLIENT-SIDE data-room uploads (@vercel/blob/client).
 *
 * Vercel serverless functions reject bodies over ~4.5 MB at the edge, and
 * financial models / decks routinely exceed that — so the browser uploads the
 * file DIRECTLY to Blob and this route only authorizes it (it never sees the
 * bytes). Files land under deal-documents/<dealId>/ in the PRIVATE store and
 * are only readable through the streaming route /api/portfolio/deal-documents/[docId].
 *
 * After the client upload completes, the browser POSTs metadata to
 * /documents (collection route) to create the DB row.
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { requireAdmin } from "@/lib/auth/require-admin"

export const runtime = "nodejs"

const MAX_BYTES = 25 * 1024 * 1024
const ALLOWED = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/markdown", "text/csv",
  "image/png", "image/jpeg", "image/webp",
  "application/zip",
]

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; dealId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { dealId } = await ctx.params

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Document uploads are not configured on this deployment (no Blob store)." },
      { status: 503 },
    )
  }
  try {
    const body = (await req.json()) as HandleUploadBody
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const prefix = `deal-documents/${dealId}/`
        if (!pathname.startsWith(prefix)) {
          throw new Error("Invalid upload path.")
        }
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ kind: "deal-document", dealId }),
        }
      },
      onUploadCompleted: async ({ blob }) => {
        console.log(`[deal documents/upload] stored: ${blob.pathname}`)
      },
    })
    return NextResponse.json(json)
  } catch (e: any) {
    console.error("[deal documents/upload]", e)
    return NextResponse.json({ error: e?.message ?? "Upload authorization failed" }, { status: 400 })
  }
}

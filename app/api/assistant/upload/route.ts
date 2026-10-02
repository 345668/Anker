/**
 * POST /api/assistant/upload — client-upload token for chat attachments above the
 * hosted request limit (docs/architecture/36). The browser uploads straight to private
 * Vercel Blob; the chat route reads the file server-side and deletes it. Tokens are bound
 * to this workspace's prefix, the allowed types, a 25 MB ceiling and ten minutes.
 */
import { NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { ATTACHMENT_CONTENT_TYPES, BLOB_MAX_BYTES, attachmentPrefix } from "@/lib/assistant/attachment-limits"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const p = await requireAiPrincipal()
    const body = (await req.json()) as HandleUploadBody
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(attachmentPrefix(p.scopeKey))) throw new WorkspaceError("Upload path not allowed.", 403)
        return {
          allowedContentTypes: ATTACHMENT_CONTENT_TYPES,
          maximumSizeInBytes: BLOB_MAX_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60_000,
        }
      },
      onUploadCompleted: async () => { /* the chat route reads and deletes the blob */ },
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof WorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "The upload could not be authorised." }, { status: 400 })
  }
}

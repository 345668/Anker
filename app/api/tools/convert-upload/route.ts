/**
 * POST /api/tools/convert-upload — client-upload token for the exact-layout converter. Signed-in workspace members only; the
 * token is bound to the caller's own folder, the document types, 25 MB and ten minutes. The convert route reads the file and deletes it.
 */
import { NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { CONVERT_MAX_BYTES, CONVERT_TYPES, convertPrefix } from "@/lib/tools/convert-files"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const p = await requireAiPrincipal()
    const body = (await req.json()) as HandleUploadBody
    const result = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(convertPrefix(p.scopeKey))) throw new WorkspaceError("Upload path not allowed.", 403)
        return { allowedContentTypes: CONVERT_TYPES, maximumSizeInBytes: CONVERT_MAX_BYTES, addRandomSuffix: true, validUntil: Date.now() + 10 * 60_000 }
      },
      onUploadCompleted: async () => { /* the convert route reads and deletes the blob */ },
    })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof WorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "The upload could not be authorised." }, { status: 400 })
  }
}

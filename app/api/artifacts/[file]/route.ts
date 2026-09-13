import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireWorkspace, workspaceError } from "@/lib/auth/workspace-context"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  try {
    const scope = await requireWorkspace()
    const { file } = await params
    const [artifact] = await sql`SELECT filename, content_type, encode(content, 'base64') AS bytes FROM private_artifacts
      WHERE id = ${file} AND user_id = ${scope.userId} AND org_id = ${scope.orgId} AND expires_at > now()`
    if (!artifact) return NextResponse.json({ error: "File unavailable or expired. Generate a new copy in its original workspace." }, { status: 404 })
    return new NextResponse(new Uint8Array(Buffer.from(artifact.bytes, "base64")), { headers: {
      "Content-Type": artifact.content_type, "Content-Disposition": `attachment; filename="${artifact.filename}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } })
  } catch (error) { return workspaceError(error) }
}

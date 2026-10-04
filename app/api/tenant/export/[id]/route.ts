/**
 * GET /api/tenant/export/<request id> — download a workspace export. Signed-in owners and admins of THAT workspace only, while it has not expired.
 * Staff never get this link: it is emailed to the workspace's own owners.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to download your export." }, { status: 401 })
  const r = ((await sql.unsafe("SELECT org_id, detail, status FROM tenant_requests WHERE id = $1 AND kind = 'export'", [id])) as any[])[0]
  const allowed = r && ((await sql.unsafe("SELECT 1 FROM memberships WHERE org_id = $1 AND user_id = $2 AND org_role IN ('workspace_owner','admin')", [r.org_id, user.id])) as any[]).length > 0
  // The same answer for "no such export" and "not yours", so the ids cannot be probed.
  if (!r || !allowed || r.status !== "done") return NextResponse.json({ error: "Not found." }, { status: 404 })
  const detail = typeof r.detail === "string" ? JSON.parse(r.detail) : r.detail
  if (!detail?.blobUrl || new Date(detail.expiresAt).getTime() < Date.now()) return NextResponse.json({ error: "This export has expired. Ask for a new one." }, { status: 410 })
  const res = await fetch(detail.blobUrl, { headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } })
  if (!res.ok || !res.body) return NextResponse.json({ error: "The export could not be read." }, { status: 502 })
  return new Response(res.body, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="anker-export-${id.slice(0, 8)}.zip"`, "Cache-Control": "private, no-store" } })
}

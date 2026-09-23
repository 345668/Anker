/**
 * Saved Discover searches (docs/architecture/14 §9).
 *   GET    /api/discovery/saved-searches
 *   POST   { name, lens, filters }
 *   DELETE ?id=
 */
import { NextRequest, NextResponse } from "next/server"
import { requireWorkspace, workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
import { sql } from "@/lib/db"
import { isLensFor } from "@/lib/platform/discovery-lenses"

export const runtime = "nodejs"

export async function GET() {
  try {
    const scope = await requireWorkspace()
    const rows = await sql`SELECT id, name, lens, filters, created_at FROM discovery_saved_searches
                            WHERE org_id = ${scope.orgId} AND user_id = ${scope.userId} ORDER BY created_at DESC LIMIT 50`
    return NextResponse.json({ searches: rows })
  } catch (e) { return workspaceError(e) }
}

export async function POST(req: NextRequest) {
  try {
    const scope = await requireWorkspace(true)
    const body = await req.json()
    const name = String(body?.name ?? "").trim().slice(0, 80)
    if (!name) throw new WorkspaceError("Name the search.", 400)
    if (!isLensFor(String(body?.lens ?? ""), scope.persona as any)) throw new WorkspaceError("Unknown lens.", 400)
    const filters = body?.filters && typeof body.filters === "object" ? body.filters : {}
    if (JSON.stringify(filters).length > 4000) throw new WorkspaceError("Too many filters.", 400)
    const [row] = await sql`INSERT INTO discovery_saved_searches (id, org_id, user_id, lens, name, filters)
      VALUES (${`dss_${crypto.randomUUID()}`}, ${scope.orgId}, ${scope.userId}, ${body.lens}, ${name}, ${JSON.stringify(filters)}::jsonb)
      RETURNING id, name, lens, filters, created_at`
    return NextResponse.json({ ok: true, search: row })
  } catch (e) { return workspaceError(e) }
}

export async function DELETE(req: NextRequest) {
  try {
    const scope = await requireWorkspace(true)
    const id = req.nextUrl.searchParams.get("id") ?? ""
    await sql`DELETE FROM discovery_saved_searches WHERE id = ${id} AND org_id = ${scope.orgId} AND user_id = ${scope.userId}`
    return NextResponse.json({ ok: true })
  } catch (e) { return workspaceError(e) }
}

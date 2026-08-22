/**
 * Owner console — revoke one MCP token (soft delete via revoked_at). The MCP auth
 * lookup filters `revoked_at IS NULL`, so revocation takes effect immediately.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { isOwner } from "@/lib/auth/admin"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function gate(): Promise<{ userId: string } | NextResponse> {
  const g = await requireAdmin()
  if (g instanceof NextResponse) return g
  if (!isOwner(g.email)) return NextResponse.json({ error: "Owner only" }, { status: 403 })
  return { userId: g.id }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const who = await gate()
  if (who instanceof NextResponse) return who
  const { id } = await params
  try {
    const rows = await sql`
      UPDATE mcp_tokens SET revoked_at = now()
      WHERE id = ${id} AND revoked_at IS NULL
      RETURNING id`
    return NextResponse.json({ ok: rows.length > 0, revoked: rows.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "revoke failed" }, { status: 500 })
  }
}

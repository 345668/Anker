/**
 * POST /api/portfolio/lp-imports/[id]/dismiss — reject a queued import
 * without writing any positions (kept for audit). Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const rows = await sql`
    update lp_statement_imports
    set status = 'dismissed', reviewed_by = ${guard.id}, reviewed_at = now(), updated_at = now()
    where id = ${id}::uuid and status = 'pending'
    returning id
  ` as Array<{ id: string }>
  if (!rows.length) return NextResponse.json({ error: "Not found or already reviewed" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

/**
 * POST /api/portfolio/kpi-updates/[id]/dismiss — reject a queued extraction
 * without writing any KPI. Kept for audit (status 'dismissed'). Admin-gated.
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
    update portfolio_kpi_extractions
    set status = 'dismissed', reviewed_by = ${guard.id}, reviewed_at = now(), updated_at = now()
    where id = ${id}::uuid and status = 'pending'
    returning id
  ` as Array<{ id: string }>
  if (!rows.length) return NextResponse.json({ error: "Not found or already reviewed" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

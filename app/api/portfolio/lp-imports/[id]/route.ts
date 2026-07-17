/**
 * PATCH  /api/portfolio/lp-imports/[id] — edit a queued import before approval.
 *          { asOf?, positions? }   positions = the full edited array
 *          [{ lpId, lpName, commitment, called, distributed, nav }]
 * DELETE /api/portfolio/lp-imports/[id]
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

const num = (v: unknown): number | null => {
  if (v === null || v === "" || v === undefined) return null
  const n = Number(v); return Number.isFinite(n) ? n : null
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params

  let b: any = {}
  try { b = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const hasAsOf = "asOf" in b
  const asOf = hasAsOf && b.asOf ? String(b.asOf) : null
  const hasPositions = Array.isArray(b.positions)
  const positions = hasPositions
    ? b.positions.slice(0, 300).map((p: any) => ({
        lpId: p.lpId ? String(p.lpId) : null,
        lpName: String(p.lpName ?? "").slice(0, 200),
        commitment: num(p.commitment),
        called: num(p.called),
        distributed: num(p.distributed),
        nav: num(p.nav),
      }))
    : null

  const rows = await sql`
    update lp_statement_imports set
      as_of      = case when ${hasAsOf} then ${asOf}::date else as_of end,
      positions  = case when ${hasPositions} then ${JSON.stringify(positions)}::jsonb else positions end,
      updated_at = now()
    where id = ${id}::uuid and status = 'pending'
    returning id
  ` as Array<{ id: string }>
  if (!rows.length) return NextResponse.json({ error: "Not found or already reviewed" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const rows = await sql`delete from lp_statement_imports where id = ${id}::uuid returning id` as Array<{ id: string }>
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

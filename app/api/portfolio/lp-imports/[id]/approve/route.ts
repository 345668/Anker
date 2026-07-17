/**
 * POST /api/portfolio/lp-imports/[id]/approve — commit a reviewed import.
 *
 * For each position: writes a dated lp_positions row (as of the import date)
 * and upserts the current-state fund_lps row. Matched LPs update in place;
 * unmatched names create a new fund_lps row (createLp, which recomputes
 * ownership_pct). Requires an as-of date. Re-approving the same as-of date
 * overwrites those position rows (unique constraint).
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { createLp, updateLp } from "@/lib/portfolio/funds"

export const runtime = "nodejs"
export const maxDuration = 60

interface Pos {
  lpId: string | null
  lpName: string
  commitment: number | null
  called: number | null
  distributed: number | null
  nav: number | null
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params

  const rows = await sql`
    select id, fund_id, as_of, positions from lp_statement_imports
    where id = ${id}::uuid and status = 'pending' limit 1
  ` as Array<{ id: string; fund_id: string; as_of: string | null; positions: any }>
  const imp = rows[0]
  if (!imp) return NextResponse.json({ error: "Not found or already reviewed" }, { status: 404 })
  if (!imp.as_of) return NextResponse.json({ error: "Set the as-of date first." }, { status: 400 })

  const positions: Pos[] = Array.isArray(imp.positions) ? imp.positions : []
  if (!positions.length) return NextResponse.json({ error: "No positions to apply." }, { status: 400 })

  const asOf = String(imp.as_of).slice(0, 10)
  let created = 0, updated = 0

  for (const p of positions) {
    if (!p.lpName?.trim()) continue
    let lpId = p.lpId

    if (lpId) {
      // Update the current-state row (only overwrite fields the statement carried).
      await updateLp(lpId, {
        ...(p.commitment != null ? { commitmentAmount: p.commitment } : {}),
        ...(p.called != null ? { calledAmount: p.called } : {}),
        ...(p.distributed != null ? { distributedAmount: p.distributed } : {}),
      })
      updated++
    } else {
      const lp = await createLp({
        fundId: imp.fund_id,
        lpName: p.lpName.trim(),
        commitmentAmount: p.commitment,
        calledAmount: p.called ?? 0,
        distributedAmount: p.distributed ?? 0,
        notes: "Imported from LP statement",
      })
      lpId = lp.id
      created++
    }

    // Dated position (history). Upsert on (fund_id, lp_id, as_of).
    await sql`
      insert into lp_positions (fund_id, lp_id, lp_name, as_of, commitment, called, distributed, nav, source, import_id, created_by)
      values (${imp.fund_id}, ${lpId}, ${p.lpName.trim()}, ${asOf}::date,
              ${p.commitment}, ${p.called}, ${p.distributed}, ${p.nav}, 'statement_import', ${imp.id}::uuid, ${guard.id})
      on conflict (fund_id, lp_id, as_of) do update set
        lp_name = excluded.lp_name, commitment = excluded.commitment, called = excluded.called,
        distributed = excluded.distributed, nav = excluded.nav, import_id = excluded.import_id
    `
  }

  await sql`
    update lp_statement_imports set status = 'approved', reviewed_by = ${guard.id}, reviewed_at = now(), updated_at = now()
    where id = ${id}::uuid
  `
  return NextResponse.json({ ok: true, asOf, created, updated })
}

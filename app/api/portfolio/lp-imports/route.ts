/**
 * /api/portfolio/lp-imports — paste-a-statement LP capital import queue.
 *
 *   GET  ?status=pending|approved|dismissed    list imports (default pending)
 *   POST { rawText, fundId? }                  extract → queue a pending import
 *
 * POST extracts every LP position from a pasted statement, matches names to
 * fund_lps, and queues a pending import. Approve writes lp_positions (dated)
 * and upserts fund_lps current-state. Admin-gated.
 *
 * Feature adapted from Hemrock Portfolio Reporting (Apache-2.0); see NOTICE.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { extractLpStatement, matchLps } from "@/lib/portfolio/lp-statement-extract"

export const runtime = "nodejs"
export const maxDuration = 120

const FLAGSHIP = "svs-fund-ii"

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const status = req.nextUrl.searchParams.get("status") || "pending"
  const valid = ["pending", "approved", "dismissed"].includes(status) ? status : "pending"
  const rows = await sql`
    select id, fund_id, as_of, positions, confidence, status, created_at
    from lp_statement_imports
    where status = ${valid}
    order by created_at desc
    limit 100
  `
  return NextResponse.json({ imports: rows })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard

  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const rawText = typeof body.rawText === "string" ? body.rawText.trim() : ""
  if (rawText.length < 20) {
    return NextResponse.json({ error: "Paste the LP statement (at least 20 characters)." }, { status: 400 })
  }
  const fundId = typeof body.fundId === "string" && body.fundId ? body.fundId : FLAGSHIP

  const ex = await extractLpStatement(rawText)
  if (!ex.positions.length) {
    return NextResponse.json({ error: "No LP positions found in that text." }, { status: 422 })
  }
  const matches = await matchLps(fundId, ex.positions.map((p) => p.lpName))
  const positions = ex.positions.map((p) => ({ ...p, lpId: matches.get(p.lpName) ?? null }))

  const rows = await sql`
    insert into lp_statement_imports (fund_id, as_of, raw_text, positions, confidence, status, created_by)
    values (${fundId}, ${ex.asOf}::date, ${rawText}, ${JSON.stringify(positions)}::jsonb, ${ex.confidence}, 'pending', ${guard.id})
    returning id
  ` as Array<{ id: string }>

  return NextResponse.json({
    ok: true, id: rows[0].id, asOf: ex.asOf,
    matched: positions.filter((p) => p.lpId).length, total: positions.length,
  }, { status: 201 })
}

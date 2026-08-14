import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { getLpMembershipsForEmail } from "@/lib/portfolio/data-room"

export const runtime = "nodejs"

/**
 * POST — LP write-back. An LP acknowledges a capital call (intent to wire) or
 * confirms receipt of a distribution.
 * Body: { kind: 'call' | 'distribution', lineId: string, undo?: boolean }
 *
 * Authorization: the line item must belong to a fund_lp the signed-in user is
 * attached to (by contact email). No cross-LP writes.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch { /* ignore */ }
  const kind = body?.kind === "distribution" ? "distribution" : body?.kind === "call" ? "call" : null
  const lineId = String(body?.lineId ?? "")
  const undo = !!body?.undo
  if (!kind || !lineId) return NextResponse.json({ error: "Invalid payload" }, { status: 400 })

  const memberships = await getLpMembershipsForEmail(user.email)
  const fundLpIds = memberships.map((m) => m.fund_lp_id)
  if (!fundLpIds.length) return NextResponse.json({ error: "No LP access" }, { status: 403 })

  const ts = undo ? null : new Date().toISOString()

  if (kind === "call") {
    const updated = await sql`
      UPDATE capital_call_line_items
      SET lp_acknowledged_at = ${ts}, updated_at = NOW()
      WHERE id = ${lineId} AND fund_lp_id = ANY(${fundLpIds})
      RETURNING id
    `
    if (!updated.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  } else {
    const updated = await sql`
      UPDATE distribution_line_items
      SET lp_confirmed_at = ${ts}, updated_at = NOW()
      WHERE id = ${lineId} AND fund_lp_id = ANY(${fundLpIds})
      RETURNING id
    `
    if (!updated.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true, at: ts })
}

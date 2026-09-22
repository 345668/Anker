import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { getLpMembershipsForEmail } from "@/lib/portfolio/data-room"
import { recordChange, snapshotRow, auditContext } from "@/lib/audit/record-change"

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
  const table = kind === "call" ? "capital_call_line_items" : "distribution_line_items"

  // An LP acknowledging a call is their side of a money movement, and `undo`
  // sets the timestamp back to null — so without this the only evidence an
  // acknowledgement ever existed is erased by withdrawing it. Both directions
  // are recorded, in the FUND's scope, so the GP's trail shows what each LP
  // confirmed and what they withdrew. Authorization is unchanged and runs
  // first: the snapshot is only taken for a line the LP could already see.
  const before = await snapshotRow(table, lineId)

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

  const after = await snapshotRow(table, lineId)
  const parent = kind === "call"
    ? await snapshotRow("capital_calls", String(after?.call_id ?? ""))
    : await snapshotRow("distributions", String(after?.distribution_id ?? ""))
  await recordChange({
    ...auditContext(req, { id: user.id, email: user.email }),
    scope: { type: "fund", id: String(parent?.fund_id ?? "unknown") },
    action: kind === "call"
      ? (undo ? "capital_call_line.acknowledgement_withdrawn" : "capital_call_line.acknowledged")
      : (undo ? "distribution_line.confirmation_withdrawn" : "distribution_line.confirmed"),
    target: { type: kind === "call" ? "capital_call_line" : "distribution_line", id: lineId, label: String(after?.fund_lp_id ?? "") },
    before, after,
    context: { byLp: true },
  })

  return NextResponse.json({ ok: true, at: ts })
}

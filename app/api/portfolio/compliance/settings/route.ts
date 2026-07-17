/**
 * PATCH /api/portfolio/compliance/settings — override one item's state.
 * Body: { fundId?, compliance_item_id, applies?, dismissed?, dismissed_reason?, notes? }
 * Admin-gated. Feature adapted from Hemrock Portfolio Reporting (Apache-2.0).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { upsertSetting } from "@/lib/portfolio/compliance"
import { resolveComplianceFundId } from "@/lib/portfolio/compliance-fund"

export const runtime = "nodejs"

const VALID_APPLIES = ["yes", "no", "unsure"]

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  let body: any = {}
  try { body = await req.json() } catch {}
  const itemId = typeof body?.compliance_item_id === "string" ? body.compliance_item_id.slice(0, 100) : ""
  if (!itemId) return NextResponse.json({ error: "compliance_item_id required" }, { status: 400 })
  const fundId = await resolveComplianceFundId(body?.fundId ?? null)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })

  await upsertSetting(fundId, itemId, {
    applies: VALID_APPLIES.includes(body.applies) ? body.applies : (body.applies === null ? null : undefined),
    dismissed: typeof body.dismissed === "boolean" ? body.dismissed : false,
    dismissed_reason: typeof body.dismissed_reason === "string" ? body.dismissed_reason.slice(0, 500) : null,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : null,
  })
  return NextResponse.json({ ok: true })
}

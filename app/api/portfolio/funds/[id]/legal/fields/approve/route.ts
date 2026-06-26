/**
 * POST /api/portfolio/funds/[id]/legal/fields/approve
 *
 * Body: { fieldKey: string, approve: boolean }
 *
 * Toggles a field's approval state. Stamps approved_at + approved_by
 * on approve; clears the row on unapprove. Returns the updated payload.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { setApprovalState } from "@/lib/portfolio/legal-fields"

export const runtime = "nodejs"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const fund = UUID_RE.test(slugOrId.trim())
    ? (await getFundById(slugOrId)) ?? (await getFundBySlug(slugOrId))
    : await getFundBySlug(slugOrId)
  return fund?.id ?? null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const body = await req.json()
    const fieldKey = typeof body?.fieldKey === "string" ? body.fieldKey : null
    const approve = body?.approve === true
    if (!fieldKey) {
      return NextResponse.json({ error: "Body must include { fieldKey: string, approve: boolean }" }, { status: 400 })
    }
    const payload = await setApprovalState(fundId, fieldKey, approve, admin.email ?? admin.id ?? null)
    return NextResponse.json(payload)
  } catch (e: any) {
    console.error("[legal-fields approve POST]", e)
    return NextResponse.json({ error: e?.message ?? "Approval failed" }, { status: 500 })
  }
}

/**
 * GET    /api/portfolio/funds/[id]/distributions/[distId]
 * PATCH  /api/portfolio/funds/[id]/distributions/[distId]
 * DELETE /api/portfolio/funds/[id]/distributions/[distId]
 *
 * DELETE snapshots paid line items first and reverses each LP's
 * distributed_amount before CASCADE wipes the rows.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  getDistributionById, updateDistribution, deleteDistribution,
  listDistributionLineItems,
  DISTRIBUTION_STATUSES, type DistributionStatus,
} from "@/lib/portfolio/distributions"

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; distId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { distId } = await ctx.params
  const distribution = await getDistributionById(distId)
  if (!distribution) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const lineItems = await listDistributionLineItems(distId)
  return NextResponse.json({ distribution, lineItems })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; distId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { distId } = await ctx.params
  try {
    const body = await req.json()
    const patch: any = {}
    if (typeof body.title === "string") patch.title = body.title
    if ("source" in body) patch.source = body.source ?? null
    if ("sourceCompanyId" in body) patch.sourceCompanyId = body.sourceCompanyId ?? null
    if ("grossAmount" in body) patch.grossAmount = numOrNull(body.grossAmount)
    if ("mgmtFeeDeduction" in body) patch.mgmtFeeDeduction = numOrNull(body.mgmtFeeDeduction)
    if ("carryDeduction" in body) patch.carryDeduction = numOrNull(body.carryDeduction)
    if ("netAmount" in body) patch.netAmount = numOrNull(body.netAmount)
    if ("paymentDate" in body) patch.paymentDate = body.paymentDate ?? null
    if ("noticeMd" in body) patch.noticeMd = body.noticeMd ?? null
    if ("noticeSubject" in body) patch.noticeSubject = body.noticeSubject ?? null
    if (typeof body.status === "string"
        && (DISTRIBUTION_STATUSES as readonly string[]).includes(body.status)) {
      patch.status = body.status as DistributionStatus
    }
    const distribution = await updateDistribution(distId, patch)
    if (!distribution) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ distribution })
  } catch (e: any) {
    console.error("[distributions PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; distId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { distId } = await ctx.params
  try {
    const ok = await deleteDistribution(distId)
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (e: any) {
    console.error("[distributions DELETE]", e)
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 })
  }
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

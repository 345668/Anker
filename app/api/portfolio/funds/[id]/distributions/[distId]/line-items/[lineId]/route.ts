/**
 * PATCH  /api/portfolio/funds/[id]/distributions/[distId]/line-items/[lineId]
 * DELETE /api/portfolio/funds/[id]/distributions/[distId]/line-items/[lineId]
 *
 * status='paid' increments fund_lps.distributed_amount.
 * status away from 'paid' reverses it.
 * Parent distribution flips to 'paid' when every line is paid or waived.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  updateDistributionLineItem, deleteDistributionLineItem,
  DISTRIBUTION_LINE_STATUSES, type DistributionLineStatus,
} from "@/lib/portfolio/distributions"

export const runtime = "nodejs"

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; distId: string; lineId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { lineId } = await ctx.params
  try {
    const body = await req.json()
    const patch: any = {}
    if ("amount" in body) {
      const n = Number(body.amount)
      if (!Number.isFinite(n)) return NextResponse.json({ error: "amount must be a number" }, { status: 400 })
      patch.amount = n
    }
    if (typeof body.status === "string"
        && (DISTRIBUTION_LINE_STATUSES as readonly string[]).includes(body.status)) {
      patch.status = body.status as DistributionLineStatus
    }
    if ("paymentRef" in body) patch.paymentRef = body.paymentRef ?? null
    if ("notes" in body) patch.notes = body.notes ?? null
    if ("paidAt" in body) patch.paidAt = body.paidAt ?? null
    if ("notifiedAt" in body) patch.notifiedAt = body.notifiedAt ?? null
    if ("resendMessageId" in body) patch.resendMessageId = body.resendMessageId ?? null
    const result = await updateDistributionLineItem(lineId, patch)
    if (!result.line) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[dist line-items PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; distId: string; lineId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { lineId } = await ctx.params
  try {
    const result = await deleteDistributionLineItem(lineId)
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[dist line-items DELETE]", e)
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 })
  }
}

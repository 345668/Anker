/**
 * PATCH  /api/portfolio/funds/[id]/capital-calls/[callId]/line-items/[lineId]
 *   Body: { amount?, status?, paymentRef?, notes?, paidAt? }
 *   Flipping status='paid' increments fund_lps.called_amount and may
 *   flip the LP's status to fully_called and the call's status to settled.
 *
 * DELETE /api/portfolio/funds/[id]/capital-calls/[callId]/line-items/[lineId]
 *   Reverses called_amount + LP status before deleting if the row was paid.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  updateLineItem, deleteLineItem,
  LINE_STATUSES, type LineStatus,
} from "@/lib/portfolio/capital-calls"

export const runtime = "nodejs"

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; callId: string; lineId: string }> },
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
        && (LINE_STATUSES as readonly string[]).includes(body.status)) {
      patch.status = body.status as LineStatus
    }
    if ("paymentRef" in body) patch.paymentRef = body.paymentRef ?? null
    if ("notes" in body) patch.notes = body.notes ?? null
    if ("paidAt" in body) patch.paidAt = body.paidAt ?? null
    if ("sentAt" in body) patch.sentAt = body.sentAt ?? null
    if ("resendMessageId" in body) patch.resendMessageId = body.resendMessageId ?? null
    const result = await updateLineItem(lineId, patch)
    if (!result.line) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[line-items PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; callId: string; lineId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { lineId } = await ctx.params
  try {
    const result = await deleteLineItem(lineId)
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[line-items DELETE]", e)
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 })
  }
}

/**
 * GET    /api/portfolio/funds/[id]/capital-calls/[callId]
 *   Returns the call + line items joined with LP names.
 *
 * PATCH  /api/portfolio/funds/[id]/capital-calls/[callId]
 *   Body: { title?, purpose?, defaultCallPct?, dueDate?, noticeMd?,
 *           noticeSubject?, status? }
 *
 * DELETE /api/portfolio/funds/[id]/capital-calls/[callId]
 *   Cascades line items. If any were paid, the LP's called_amount is
 *   decremented atomically by deleteCall().
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  getCallById, updateCall, deleteCall, listLineItems,
  CALL_STATUSES, type CallStatus,
} from "@/lib/portfolio/capital-calls"

export const runtime = "nodejs"

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; callId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { callId } = await ctx.params
  const call = await getCallById(callId)
  if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const lineItems = await listLineItems(callId)
  return NextResponse.json({ call, lineItems })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; callId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { callId } = await ctx.params
  try {
    const body = await req.json()
    const patch: any = {}
    if (typeof body.title === "string") patch.title = body.title
    if ("purpose" in body) patch.purpose = body.purpose ?? null
    if ("defaultCallPct" in body) patch.defaultCallPct = numOrNull(body.defaultCallPct)
    if ("dueDate" in body) patch.dueDate = body.dueDate ?? null
    if ("noticeMd" in body) patch.noticeMd = body.noticeMd ?? null
    if ("noticeSubject" in body) patch.noticeSubject = body.noticeSubject ?? null
    if (typeof body.status === "string"
        && (CALL_STATUSES as readonly string[]).includes(body.status)) {
      patch.status = body.status as CallStatus
    }
    const call = await updateCall(callId, patch)
    if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ call })
  } catch (e: any) {
    console.error("[capital-calls PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; callId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { callId } = await ctx.params
  try {
    const ok = await deleteCall(callId)
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (e: any) {
    console.error("[capital-calls DELETE]", e)
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 })
  }
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

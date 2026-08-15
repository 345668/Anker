/**
 * GET    /api/portfolio/funds/[id]/lps/[lpId]
 * PATCH  /api/portfolio/funds/[id]/lps/[lpId]
 * DELETE /api/portfolio/funds/[id]/lps/[lpId]
 *
 * The fund [id] segment is accepted for symmetry but not strictly required —
 * an LP id is globally unique. We do still validate the LP belongs to the
 * named fund to make permission boundaries trivially auditable.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  getFundById, getFundBySlug,
  getLpById, updateLp, deleteLp,
  LP_TYPES, LP_STATUSES, SUBSCRIPTION_STATUSES, type LpType, type LpStatus, type SubscriptionStatus,
} from "@/lib/portfolio/funds"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const fund = UUID_RE.test(slugOrId.trim())
    ? (await getFundById(slugOrId)) ?? (await getFundBySlug(slugOrId))
    : await getFundBySlug(slugOrId)
  return fund?.id ?? null
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; lpId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, lpId } = await ctx.params
  const fundId = await resolveFundId(id)
  const lp = await getLpById(lpId)
  if (!lp || (fundId && lp.fund_id !== fundId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return NextResponse.json({ lp })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; lpId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, lpId } = await ctx.params
  const fundId = await resolveFundId(id)
  const existing = await getLpById(lpId)
  if (!existing || (fundId && existing.fund_id !== fundId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  try {
    const body = await req.json()
    const patch: any = {}
    if (typeof body.lpName === "string") patch.lpName = body.lpName
    if ("lpType" in body) patch.lpType = parseLpType(body.lpType)
    if ("lpContactId" in body) patch.lpContactId = body.lpContactId ?? null
    if ("commitmentAmount" in body) patch.commitmentAmount = numOrNull(body.commitmentAmount)
    if ("calledAmount" in body) patch.calledAmount = numOrNull(body.calledAmount)
    if ("distributedAmount" in body) patch.distributedAmount = numOrNull(body.distributedAmount)
    if ("signedAt" in body) patch.signedAt = body.signedAt ?? null
    if (typeof body.status === "string" && (LP_STATUSES as readonly string[]).includes(body.status)) {
      patch.status = body.status as LpStatus
    }
    if (typeof body.subscriptionStatus === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(body.subscriptionStatus)) {
      patch.subscriptionStatus = body.subscriptionStatus as SubscriptionStatus
    }
    if ("notes" in body) patch.notes = body.notes ?? null
    if ("metadata" in body && body.metadata && typeof body.metadata === "object") {
      patch.metadata = body.metadata
    }
    const lp = await updateLp(lpId, patch)
    return NextResponse.json({ lp })
  } catch (e: any) {
    console.error("[fund_lps PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; lpId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, lpId } = await ctx.params
  const fundId = await resolveFundId(id)
  const existing = await getLpById(lpId)
  if (!existing || (fundId && existing.fund_id !== fundId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  try {
    const result = await deleteLp(lpId)
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[fund_lps DELETE]", e)
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 })
  }
}

function parseLpType(s: any): LpType | null {
  if (typeof s === "string" && (LP_TYPES as readonly string[]).includes(s)) return s as LpType
  return null
}
function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

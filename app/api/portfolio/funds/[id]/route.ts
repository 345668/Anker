/**
 * GET    /api/portfolio/funds/[id]     — fund + LP list + rollup
 * PATCH  /api/portfolio/funds/[id]     — update fund (slug, status, fees, ...)
 * DELETE /api/portfolio/funds/[id]     — delete fund (warns about orphans)
 *
 * Admin-gated.
 *
 * Accepts EITHER UUID id or slug as the [id] path parameter.  When you've
 * stored 'svs-fund-ii' on portfolio_companies.fund_id, the caller has the
 * slug, not the UUID — letting the route accept both makes wiring trivial.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  getFundById, getFundBySlug, updateFund, deleteFund,
  listLps, getFundLpRollup,
  FUND_STATUSES, type FundStatus,
} from "@/lib/portfolio/funds"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFund(slugOrId: string) {
  const trimmed = slugOrId.trim()
  if (!trimmed) return null
  if (UUID_RE.test(trimmed)) {
    return (await getFundById(trimmed)) ?? (await getFundBySlug(trimmed))
  }
  return getFundBySlug(trimmed)
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fund = await resolveFund(id)
  if (!fund) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const [lps, rollup] = await Promise.all([listLps(fund.id), getFundLpRollup(fund.id)])
  return NextResponse.json({ fund, lps, rollup })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fund = await resolveFund(id)
  if (!fund) return NextResponse.json({ error: "Not found" }, { status: 404 })
  try {
    const body = await req.json()
    const patch: any = {}
    if (typeof body.name === "string") patch.name = body.name
    if ("slug" in body && typeof body.slug !== "undefined") patch.slug = body.slug ?? null
    if ("description" in body) patch.description = body.description ?? null
    if ("vintageYear" in body) patch.vintageYear = typeof body.vintageYear === "number" ? body.vintageYear : null
    if ("targetSize" in body) patch.targetSize = numOrNull(body.targetSize)
    if ("currency" in body && typeof body.currency === "string") patch.currency = body.currency
    if ("managementFeePct" in body) patch.managementFeePct = numOrNull(body.managementFeePct)
    if ("carryPct" in body) patch.carryPct = numOrNull(body.carryPct)
    if ("termYears" in body) patch.termYears = typeof body.termYears === "number" ? body.termYears : null
    if ("investmentPeriodYears" in body) patch.investmentPeriodYears = typeof body.investmentPeriodYears === "number" ? body.investmentPeriodYears : null
    if (typeof body.status === "string" && (FUND_STATUSES as readonly string[]).includes(body.status)) {
      patch.status = body.status as FundStatus
    }
    if ("managerOrg" in body) patch.managerOrg = body.managerOrg ?? null
    if ("metadata" in body && body.metadata && typeof body.metadata === "object") {
      patch.metadata = body.metadata
    }
    const updated = await updateFund(fund.id, patch)
    return NextResponse.json({ fund: updated })
  } catch (e: any) {
    console.error("[funds PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fund = await resolveFund(id)
  if (!fund) return NextResponse.json({ error: "Not found" }, { status: 404 })
  try {
    const ok = await deleteFund(fund.id)
    return NextResponse.json({ deleted: ok })
  } catch (e: any) {
    console.error("[funds DELETE]", e)
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 })
  }
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

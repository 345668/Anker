/**
 * PATCH  /api/portfolio/funds/[id]/investments/[invId]   — partial update
 * DELETE /api/portfolio/funds/[id]/investments/[invId]
 *
 * Admin-gated. Verifies the investment belongs to the resolved fund.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  getInvestmentById, updateInvestment, deleteInvestment,
} from "@/lib/portfolio/investments"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const trimmed = slugOrId.trim()
  if (!trimmed) return null
  const fund = UUID_RE.test(trimmed)
    ? (await getFundById(trimmed)) ?? (await getFundBySlug(trimmed))
    : await getFundBySlug(trimmed)
  return fund?.id ?? null
}

async function loadScoped(id: string, invId: string) {
  const fundId = await resolveFundId(id)
  if (!fundId) return { error: NextResponse.json({ error: "Fund not found" }, { status: 404 }) }
  const inv = await getInvestmentById(invId)
  if (!inv || inv.fund_id !== fundId) {
    return { error: NextResponse.json({ error: "Investment not found" }, { status: 404 }) }
  }
  return { fundId, inv }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; invId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, invId } = await ctx.params
  const scoped = await loadScoped(id, invId)
  if ("error" in scoped) return scoped.error
  try {
    const body = await req.json()
    const row = await updateInvestment(invId, {
      companyId: body.companyId,
      companyName: body.companyName,
      investmentKind: body.investmentKind,
      securityType: body.securityType,
      roundName: body.roundName,
      investedAt: body.investedAt,
      costBasis: body.costBasis,
      shareCount: body.shareCount,
      fullyDilutedPct: body.fullyDilutedPct,
      roundValuation: body.roundValuation,
      status: body.status,
      exitedAt: body.exitedAt,
      realizedProceeds: body.realizedProceeds,
      notes: body.notes,
    })
    return NextResponse.json(row)
  } catch (e: any) {
    console.error("[investments PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; invId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, invId } = await ctx.params
  const scoped = await loadScoped(id, invId)
  if ("error" in scoped) return scoped.error
  try {
    await deleteInvestment(invId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error("[investments DELETE]", e)
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 })
  }
}

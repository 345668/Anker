/**
 * GET  /api/portfolio/funds/[id]/investments/[invId]/valuations  → history
 * POST /api/portfolio/funds/[id]/investments/[invId]/valuations
 *   Body: { asOfDate, fairValue, method?, source?, note? }
 *
 * Snapshots are append-only — corrections are new snapshots, never edits.
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  getInvestmentById, listSnapshots, addSnapshot,
  VALUATION_METHODS, type ValuationMethod,
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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; invId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, invId } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const inv = await getInvestmentById(invId)
  if (!inv || inv.fund_id !== fundId) {
    return NextResponse.json({ error: "Investment not found" }, { status: 404 })
  }
  const rows = await listSnapshots(invId)
  return NextResponse.json({ rows, total: rows.length })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; invId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id, invId } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const inv = await getInvestmentById(invId)
  if (!inv || inv.fund_id !== fundId) {
    return NextResponse.json({ error: "Investment not found" }, { status: 404 })
  }
  try {
    const body = await req.json()
    const asOfDate = typeof body?.asOfDate === "string" ? body.asOfDate : null
    const fairValue = Number(body?.fairValue)
    if (!asOfDate || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      return NextResponse.json({ error: "asOfDate (YYYY-MM-DD) required" }, { status: 400 })
    }
    if (!Number.isFinite(fairValue) || fairValue < 0) {
      return NextResponse.json({ error: "fairValue must be a non-negative number" }, { status: 400 })
    }
    const method: ValuationMethod =
      VALUATION_METHODS.includes(body?.method) ? body.method : "mark"
    const row = await addSnapshot({
      investmentId: invId,
      fundId,
      asOfDate,
      fairValue,
      method,
      source: body.source ?? null,
      note: body.note ?? null,
      createdBy: admin.email ?? admin.id ?? null,
    })
    return NextResponse.json(row, { status: 201 })
  } catch (e: any) {
    console.error("[valuations POST]", e)
    return NextResponse.json({ error: e?.message ?? "Snapshot failed" }, { status: 500 })
  }
}

/**
 * PUT /api/portfolio/funds/[id]/management/budget
 *   Body: { year, lines: [{ category, plannedAmount, notes? }] }
 * Upserts the year's budget lines. Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { upsertBudgetLine, listBudget, hasMcTables } from "@/lib/portfolio/management-company"

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

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  if (!(await hasMcTables())) {
    return NextResponse.json(
      { error: "management tables missing — run scripts/oneshot/run-management-company-tables.mjs first." },
      { status: 503 },
    )
  }
  try {
    const body = await req.json()
    const year = Number(body?.year)
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "year required" }, { status: 400 })
    }
    if (!Array.isArray(body?.lines)) {
      return NextResponse.json({ error: "lines[] required" }, { status: 400 })
    }
    for (const line of body.lines) {
      if (typeof line?.category !== "string" || !line.category.trim()) continue
      const planned = Number(line.plannedAmount)
      if (!Number.isFinite(planned) || planned < 0) continue
      await upsertBudgetLine({
        fundId, year,
        category: line.category.trim(),
        plannedAmount: planned,
        notes: line.notes ?? null,
      })
    }
    const budget = await listBudget(fundId, year)
    return NextResponse.json({ budget })
  } catch (e: any) {
    console.error("[management budget PUT]", e)
    return NextResponse.json({ error: e?.message ?? "Save failed" }, { status: 500 })
  }
}

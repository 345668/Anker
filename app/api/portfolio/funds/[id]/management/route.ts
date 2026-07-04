/**
 * GET /api/portfolio/funds/[id]/management?year=2026
 *   → { overview, budget, actuals, projects }
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  getMcOverview, listBudget, listActuals, listProjects,
} from "@/lib/portfolio/management-company"

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

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const yearRaw = new URL(req.url).searchParams.get("year")
  const year = yearRaw ? Number(yearRaw) : new Date().getFullYear()
  try {
    const [overview, budget, actuals, projects] = await Promise.all([
      getMcOverview(fundId, year), listBudget(fundId, year),
      listActuals(fundId, year), listProjects(fundId),
    ])
    return NextResponse.json({ overview, budget, actuals, projects })
  } catch (e: any) {
    console.error("[management GET]", e)
    return NextResponse.json({ error: e?.message ?? "Read failed" }, { status: 500 })
  }
}

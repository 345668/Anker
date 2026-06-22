/**
 * GET /api/portfolio/funds/[id]/assessment/history?limit=20
 *
 * Returns the N most-recent assessment snapshots for the fund. Used by
 * the editor sidebar to render a sparkline of the Strength score over
 * time, and by future analytics dashboards.
 *
 * Admin-gated. Returns { snapshots: [...] }.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { listSnapshots } from "@/lib/portfolio/fund-assessment-history"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const fund = UUID_RE.test(slugOrId.trim())
    ? (await getFundById(slugOrId)) ?? (await getFundBySlug(slugOrId))
    : await getFundBySlug(slugOrId)
  return fund?.id ?? null
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const url = new URL(req.url)
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? 20) || 20))
  try {
    const snapshots = await listSnapshots(fundId, limit)
    return NextResponse.json({ snapshots })
  } catch (e: any) {
    console.error("[fund-assessment history GET]", e)
    return NextResponse.json({ error: e?.message ?? "Read failed" }, { status: 500 })
  }
}

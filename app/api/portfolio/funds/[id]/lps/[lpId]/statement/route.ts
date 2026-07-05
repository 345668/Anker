/**
 * GET /api/portfolio/funds/[id]/lps/[lpId]/statement
 *   ?as_of=YYYY-MM-DD  — optional; defaults to now
 *   ?nav=12345.67       — optional; per-LP share of current fund NAV
 *
 * Returns the LP's capital account statement: commitment summary,
 * performance metrics (DPI always, TVPI/RVPI when NAV provided), and the
 * chronological transaction history (paid capital calls + paid
 * distributions) with running balances.
 *
 * Admin-gated. The LP-portal-scoped equivalent lives under /api/lp/* and
 * runs its own membership check against the requester's email.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { buildStatement } from "@/lib/portfolio/capital-account"
import { getFundNav } from "@/lib/portfolio/investments"
import { getLpById } from "@/lib/portfolio/funds"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const fund = UUID_RE.test(slugOrId.trim())
    ? (await getFundById(slugOrId)) ?? (await getFundBySlug(slugOrId))
    : await getFundBySlug(slugOrId)
  return fund?.id ?? null
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; lpId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, lpId } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) {
    return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  }

  const url = new URL(req.url)
  const asOf = url.searchParams.get("as_of")
  const navRaw = url.searchParams.get("nav")
  const nav = navRaw == null || navRaw === "" ? null : Number(navRaw)
  let currentNav = nav != null && Number.isFinite(nav) ? nav : null

  try {
    // NAV of record (Phase 1): derive the LP share when no ?nav= override.
    if (currentNav == null) {
      const lp = await getLpById(lpId)
      if (lp?.ownership_pct != null) {
        const fundNav = await getFundNav(fundId)
        if (fundNav && fundNav.markedPositionCount > 0) {
          currentNav = fundNav.positionsFairValue * Number(lp.ownership_pct)
        }
      }
    }
    const statement = await buildStatement({
      fundId,
      lpId,
      asOfDate: asOf ?? null,
      currentNav,
    })
    if (!statement) {
      return NextResponse.json({ error: "LP not found in this fund" }, { status: 404 })
    }
    return NextResponse.json({ statement })
  } catch (e: any) {
    console.error("[capital-account statement GET]", e)
    return NextResponse.json(
      { error: e?.message ?? "Failed to build statement" },
      { status: 500 },
    )
  }
}

/**
 * /api/portfolio/compliance — the merged compliance register for a fund.
 *
 *   GET ?fundId=&year=   items + computed applicability + settings + deadlines
 *
 * `fundId` may be a fund id or slug (defaults to the active workspace). Active fund workspace owner/admin only.
 * Feature adapted from Hemrock Portfolio Reporting (Apache-2.0).
 */
import { NextRequest, NextResponse } from "next/server"
import { requirePortfolioAccess } from "@/lib/auth/portfolio-access"
import { getComplianceOverview } from "@/lib/portfolio/compliance"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const guard = await requirePortfolioAccess(req)
  if (guard instanceof NextResponse) return guard
  const fundId = guard.fund.id
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getUTCFullYear()
  const data = await getComplianceOverview(fundId, year)
  return NextResponse.json({ fundId, year, ...data })
}

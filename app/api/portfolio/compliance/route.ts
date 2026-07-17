/**
 * /api/portfolio/compliance — the merged compliance register for a fund.
 *
 *   GET ?fundId=&year=   items + computed applicability + settings + deadlines
 *
 * `fundId` may be a fund id or slug (defaults to the flagship). Admin-gated.
 * Feature adapted from Hemrock Portfolio Reporting (Apache-2.0).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getComplianceOverview } from "@/lib/portfolio/compliance"
import { resolveComplianceFundId } from "@/lib/portfolio/compliance-fund"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const fundId = await resolveComplianceFundId(req.nextUrl.searchParams.get("fundId"))
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getUTCFullYear()
  const data = await getComplianceOverview(fundId, year)
  return NextResponse.json({ fundId, year, ...data })
}

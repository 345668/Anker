/**
 * GET /api/portfolio/compliance/digest
 *
 * Read-only digest data for the dashboard: the same "entering their window"
 * computation the weekly nudge cron sends, exposed for the Compliance nav
 * badge and any in-app preview.
 *
 *   ?count=1   → { count } only (cheap; the badge uses this)
 *   (default)  → { funds: FundDigest[], count }
 *
 * Only deadlines belonging to the active authorized fund are returned.
 */
import { NextRequest, NextResponse } from "next/server"
import { requirePortfolioAccess } from "@/lib/auth/portfolio-access"
import { computeComplianceDigests, DEFAULT_LEAD_DAYS } from "@/lib/portfolio/compliance-digest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const guard = await requirePortfolioAccess(req)
  if (guard instanceof NextResponse) return guard

  const url = new URL(req.url)
  const requestedDays = Number(url.searchParams.get("leadDays") ?? DEFAULT_LEAD_DAYS)
  const leadDays = Number.isFinite(requestedDays) ? Math.max(0, Math.min(365, Math.trunc(requestedDays))) : DEFAULT_LEAD_DAYS
  const digests = await computeComplianceDigests(leadDays, undefined, guard.fund.id)
  const count = digests.reduce((n, f) => n + f.total, 0)

  if (url.searchParams.get("count") === "1") {
    return NextResponse.json({ count })
  }
  return NextResponse.json({ count, funds: digests })
}

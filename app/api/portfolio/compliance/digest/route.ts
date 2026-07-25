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
 * Admin-gated, like the rest of /api/portfolio/compliance. A non-admin gets
 * 401 and the badge simply doesn't render.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { computeComplianceDigests, DEFAULT_LEAD_DAYS } from "@/lib/portfolio/compliance-digest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard

  const url = new URL(req.url)
  const leadDays = Number(url.searchParams.get("leadDays")) || DEFAULT_LEAD_DAYS
  const digests = await computeComplianceDigests(leadDays)
  const count = digests.reduce((n, f) => n + f.total, 0)

  if (url.searchParams.get("count") === "1") {
    return NextResponse.json({ count })
  }
  return NextResponse.json({ count, funds: digests })
}

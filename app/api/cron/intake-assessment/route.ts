/**
 * GET /api/cron/intake-assessment
 * Sweeps fund-intake submissions the inline run did not finish (received, or stuck assessing) and processes them.
 * Auth: Vercel Cron bearer CRON_SECRET; fails closed when unset. docs/architecture/39.
 */
import { NextRequest, NextResponse } from "next/server"
import { sweepSubmissions } from "@/lib/intake/store"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function handle(req: NextRequest) {
  if (!isCronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const results = await sweepSubmissions(Number(new URL(req.url).searchParams.get("limit")) || 10)
  return NextResponse.json({ ok: true, processed: results.length, results })
}
export const GET = trackCron("intake-assessment", handle)

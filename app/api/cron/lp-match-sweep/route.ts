/**
 * GET /api/cron/lp-match-sweep — every minute. Takes up LP matching runs whose worker died or that nobody started, and sends the finished-run message that was not sent (docs/architecture/63 M2).
 * Auth: Vercel Cron `Authorization: Bearer $CRON_SECRET`; fails closed when unset.
 */
import { NextRequest, NextResponse } from "next/server"
import { sweepLpSessions } from "@/lib/matching/lp/service"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function handle(req: NextRequest) {
  if (!isCronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { return NextResponse.json({ ok: true, ...(await sweepLpSessions()) }) } catch (e: any) { console.error("[lp-match-sweep]", e?.message ?? e); return NextResponse.json({ error: "Sweep failed" }, { status: 500 }) }
}
export const GET = trackCron("lp-match-sweep", handle)

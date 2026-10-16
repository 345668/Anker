/**
 * GET /api/cron/alerts-watchdog — every 15 minutes. Raises a severity 1 incident if the evaluator has not run lately (docs/architecture/56 section 8).
 * It shares the platform with the evaluator, so it covers a broken evaluator, not a total outage; the external uptime monitor covers that.
 */
import { NextRequest, NextResponse } from "next/server"
import { runWatchdog } from "@/lib/ops/alerts/engine"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

async function handle(req: NextRequest) {
  if (!isCronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { return NextResponse.json({ ok: true, ...(await runWatchdog()) }) } catch (e: any) { console.error("[alerts-watchdog]", e?.message ?? e); return NextResponse.json({ error: "Watchdog failed" }, { status: 500 }) }
}
export const GET = trackCron("alerts-watchdog", handle)

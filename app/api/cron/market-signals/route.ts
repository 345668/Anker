/**
 * GET /api/cron/market-signals — refresh the derived investor-activity feed.
 * Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
import { NextRequest, NextResponse } from "next/server"
import { refreshDerivedSignals } from "@/lib/signals/feed"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"

export const runtime = "nodejs"
export const maxDuration = 120

// Fails closed: with no CRON_SECRET configured nothing is authorized (it used to be everything).
function authorized(req: NextRequest): boolean {
  return isCronAuthorised(req)
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const n = await refreshDerivedSignals().catch((e: any) => { throw e })
  return NextResponse.json({ ok: true, refreshed: n })
}

// Every run is recorded in cron_runs (lib/cron/track.ts); the handler above is unchanged.
export const GET = trackCron("market-signals", handle)

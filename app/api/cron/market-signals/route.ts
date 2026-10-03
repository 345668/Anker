/**
 * GET /api/cron/market-signals — refresh the derived investor-activity feed.
 * Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
import { NextRequest, NextResponse } from "next/server"
import { refreshDerivedSignals } from "@/lib/signals/feed"
import { trackCron } from "@/lib/cron/track"

export const runtime = "nodejs"
export const maxDuration = 120

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const n = await refreshDerivedSignals().catch((e: any) => { throw e })
  return NextResponse.json({ ok: true, refreshed: n })
}

// Every run is recorded in cron_runs (lib/cron/track.ts); the handler above is unchanged.
export const GET = trackCron("market-signals", handle)

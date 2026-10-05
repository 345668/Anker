/**
 * GET /api/cron/outreach-send — the send executor (docs/architecture/46 §4). Sends authorized items within each sender's daily cap and per-tick pace, expires old
 * approvals, recovers interrupted sends, and stops entirely when the platform flag `outreach_sending_paused` (or maintenance mode) is on.
 * Auth: Vercel Cron bearer CRON_SECRET; fails closed when unset.
 */
import { NextRequest, NextResponse } from "next/server"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"
import { runExecutor } from "@/lib/outreach/send-auth/executor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function handle(req: NextRequest) {
  if (!isCronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ ok: true, ...(await runExecutor()) })
}
export const GET = trackCron("outreach-send", handle)

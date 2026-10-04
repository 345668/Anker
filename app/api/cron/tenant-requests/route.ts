/**
 * GET /api/cron/tenant-requests — runs approved erasures whose waiting period has passed, and removes expired exports.
 * Auth: Vercel Cron bearer CRON_SECRET; fails closed when unset. docs/architecture/41.
 */
import { NextRequest, NextResponse } from "next/server"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"
import { runDueErasures, expireExports } from "@/lib/tenant/requests"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function handle(req: NextRequest) {
  if (!isCronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const erasures = await runDueErasures()
  const expired = await expireExports()
  return NextResponse.json({ ok: true, erasures, expiredExports: expired })
}
export const GET = trackCron("tenant-requests", handle)

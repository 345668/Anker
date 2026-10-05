/**
 * GET /api/cron/agents — starts the scheduled agent runs that are due and resumes any that were queued or died mid-run. docs/architecture/44.
 * Auth: Vercel Cron bearer CRON_SECRET; fails closed when unset.
 */
import { NextRequest, NextResponse } from "next/server"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"
import { dispatch } from "@/lib/agents/runtime/engine"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function handle(req: NextRequest) {
  if (!isCronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const r = await dispatch(undefined, { deadlineAt: Date.now() + 240_000 })
  return NextResponse.json({ ok: true, ...r })
}
export const GET = trackCron("agents", handle)

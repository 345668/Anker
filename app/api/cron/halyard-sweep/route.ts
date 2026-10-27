/**
 * GET /api/cron/halyard-sweep — daily. Closes Halyard sessions left open past four hours and deletes ended ones past their workspace's retention date (docs/architecture/62 section 13).
 * Auth: Vercel Cron `Authorization: Bearer $CRON_SECRET`; fails closed when unset.
 */
import { NextRequest, NextResponse } from "next/server"
import { sweepSessions } from "@/lib/halyard/sessions"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

async function handle(req: NextRequest) {
  if (!isCronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { return NextResponse.json({ ok: true, ...(await sweepSessions()) }) } catch (e: any) { console.error("[halyard-sweep]", e?.message); return NextResponse.json({ error: "Sweep failed." }, { status: 500 }) }
}
export const GET = trackCron("halyard-sweep", handle)

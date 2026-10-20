/**
 * GET /api/cron/investor-nudges — daily. Reminds a fund of a request waiting a week and asks both sides about a conversation quiet for a month; declines nothing (docs/architecture/65).
 * Auth: Vercel Cron `Authorization: Bearer $CRON_SECRET`; fails closed when unset.
 */
import { NextRequest, NextResponse } from "next/server"
import { sendNudges } from "@/lib/investor/talks"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

async function handle(req: NextRequest) {
  if (!isCronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { return NextResponse.json({ ok: true, ...(await sendNudges()) }) } catch (e: any) { console.error("[investor-nudges]", e?.message ?? e); return NextResponse.json({ error: "Failed" }, { status: 500 }) }
}
export const GET = trackCron("investor-nudges", handle)

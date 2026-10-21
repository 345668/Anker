/**
 * GET /api/cron/investor-retention — daily. Removes what the investor side keeps only for a while (docs/architecture/73). ?dry=1 only counts.
 * Auth: Vercel Cron `Authorization: Bearer $CRON_SECRET`; fails closed when unset.
 */
import { NextRequest, NextResponse } from "next/server"
import { runRetention } from "@/lib/investor/retention"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

async function handle(req: NextRequest) {
  if (!isCronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { return NextResponse.json({ ok: true, dry: req.nextUrl.searchParams.get("dry") === "1", removed: await runRetention({ dryRun: req.nextUrl.searchParams.get("dry") === "1" }) }) } catch (e: any) { console.error("[investor-retention]", e?.message ?? e); return NextResponse.json({ error: "Failed" }, { status: 500 }) }
}
export const GET = trackCron("investor-retention", handle)

import { NextRequest, NextResponse } from "next/server"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"
import { sweepAllowanceWarnings } from "@/lib/metering/warnings"
import { settleAll } from "@/lib/metering/credits"
import { spendAndLimit } from "@/lib/metering/allowance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/** Every 30 minutes: warn workspace owners at 80% and 100% of the month's AI allowance (docs/architecture/58). */
async function handle(req: NextRequest) {
  if (!isCronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { const credits = await settleAll(spendAndLimit)      // prepaid credit first (expiry, then the month's overage), so the warnings below see the settled picture
    return NextResponse.json({ ok: true, ...(await sweepAllowanceWarnings()), credits }) } catch (e: any) { console.error("[usage-warnings]", e?.message ?? e); return NextResponse.json({ error: "Sweep failed" }, { status: 500 }) }
}
export const GET = trackCron("usage-warnings", handle)

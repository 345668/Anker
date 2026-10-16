/**
 * GET /api/cron/alerts-evaluate — every 5 minutes. Turns the platform's own health facts into incidents and tells a person (docs/architecture/56, A1).
 * Auth: Vercel Cron `Authorization: Bearer $CRON_SECRET`; fails closed when unset.
 */
import { NextRequest, NextResponse } from "next/server"
import { runEvaluation } from "@/lib/ops/alerts/engine"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

async function handle(req: NextRequest) {
  if (!isCronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { return NextResponse.json({ ok: true, ...(await runEvaluation()) }) } catch (e: any) { console.error("[alerts-evaluate]", e?.message ?? e); return NextResponse.json({ error: "Evaluation failed" }, { status: 500 }) }
}
export const GET = trackCron("alerts-evaluate", handle)

/**
 * Owner-only view of the learned ranker (docs/architecture/17 §5).
 *
 * GET  → what is ranking today, how much labelled evidence exists, the last
 *        fit and which guard stopped it.
 * POST { fit: true }      → run a fit now, same rules as the cron.
 * POST { activate: false } → roll straight back to the expert weights.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { deactivateFitted, fitRanker, rankerState } from "@/lib/matching/v2/ranker"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  return NextResponse.json(await rankerState())
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const body = await req.json().catch(() => ({} as any))

  if (body?.activate === false) {
    const rolledBack = await deactivateFitted()
    return NextResponse.json({
      ok: true, rolledBack,
      message: rolledBack ? `Back on the expert weights (${rolledBack} fit deactivated).` : "Nothing was active — the expert weights were already ranking.",
      state: await rankerState(),
    })
  }
  if (body?.fit === true) {
    const report = await fitRanker({ triggerType: "manual" })
    return NextResponse.json({ ok: true, ...report })
  }
  return NextResponse.json({ error: "Send { fit: true } to fit now, or { activate: false } to roll back." }, { status: 400 })
}

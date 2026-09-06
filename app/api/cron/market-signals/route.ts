/**
 * GET /api/cron/market-signals — refresh the derived investor-activity feed.
 * Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
import { NextRequest, NextResponse } from "next/server"
import { refreshDerivedSignals } from "@/lib/signals/feed"

export const runtime = "nodejs"
export const maxDuration = 120

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const n = await refreshDerivedSignals().catch((e: any) => { throw e })
  return NextResponse.json({ ok: true, refreshed: n })
}

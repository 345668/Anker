/**
 * GET /api/cron/investor-activity — daily (docs/architecture/16 §2).
 *
 * Reads the websites of the investors founders were actually shown and records
 * the most recent investment each one publishes a date for. Budgeted by
 * ACTIVITY_DAILY_LIMIT. Fails closed without CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server"
import { runActivitySweep } from "@/lib/investors/activity"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ ok: true, ...(await runActivitySweep({ limit: 60 })) })
}

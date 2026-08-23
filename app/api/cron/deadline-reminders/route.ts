/**
 * GET /api/cron/deadline-reminders
 *
 * Daily scan that turns approaching/overdue fund deadlines (capital calls,
 * distributions) into in-app notifications for the fund's GP users. Idempotent:
 * lib/notifications/deadlines.ts keys each reminder so a re-run never duplicates.
 *
 * Auth: Vercel Cron sends "Authorization: Bearer $CRON_SECRET"; a ?secret= query
 * param is accepted for manual triggering. No CRON_SECRET set → 401 (fail closed).
 *
 * ?dry=1        compute + return what WOULD be created, writing nothing.
 * ?leadDays=N   override the look-ahead window (default 14).
 *
 * Scheduling: registered in vercel.json (daily 07:00 UTC).
 */
import { NextRequest, NextResponse } from "next/server"
import { scanDeadlines } from "@/lib/notifications/deadlines"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if ((req.headers.get("authorization") || "") === `Bearer ${secret}`) return true
  return new URL(req.url).searchParams.get("secret") === secret
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const url = new URL(req.url)
  const dryRun = url.searchParams.get("dry") === "1"
  const leadDays = Number(url.searchParams.get("leadDays")) || undefined

  try {
    const result = await scanDeadlines({ leadDays, dryRun })
    return NextResponse.json({ ok: true, dryRun, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "scan failed" }, { status: 500 })
  }
}

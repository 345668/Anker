/**
 * Owner-only view and trigger for investor activity (docs/architecture/20 §2.4).
 *
 * The sweep was reachable only through a 03:45 cron, so "last seen investing"
 * stayed blank — 0 of 18,982 firms checked — with no way to start it or to see
 * how far it had got.
 *
 * GET  → coverage: how many firms are checked, how many carry a date, how
 *        stale the oldest check is, and today's remaining budget.
 * POST { limit?, ids? } → run a bounded sweep now and report what it found.
 *
 * This adds a trigger, not a policy: the budget, the 90-day re-check window
 * and the evidence rule (doc 16 §2) are the sweep's, unchanged.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { checksToday, dailyLimit, runActivitySweep } from "@/lib/investors/activity"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard

  const [coverage] = await sql`
    SELECT count(*)::int                                                          AS firms,
           count(*) FILTER (WHERE activity_checked_at IS NOT NULL)::int           AS checked,
           count(*) FILTER (WHERE last_investment_at IS NOT NULL)::int            AS dated,
           count(*) FILTER (WHERE activity_checked_at < now() - interval '90 days')::int AS stale,
           min(activity_checked_at)                                               AS oldest_check
      FROM investment_firms`
  const [queue] = await sql`
    SELECT count(DISTINCT r.entity_id)::int AS waiting
      FROM founder_match_results r
      JOIN founder_match_runs run ON run.id = r.run_id
     WHERE run.created_at > now() - interval '30 days' AND r.kind = 'group' AND r.rank <= 200`
  const used = await checksToday()

  return NextResponse.json({
    firms: coverage.firms,
    checked: coverage.checked,
    dated: coverage.dated,
    stale: coverage.stale,
    oldestCheck: coverage.oldest_check ? new Date(coverage.oldest_check).toISOString() : null,
    // What the cron would pick up: the firms founders were actually shown.
    queued: queue.waiting,
    budget: { dailyLimit: dailyLimit(), usedToday: used, left: Math.max(0, dailyLimit() - used) },
  })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const body = await req.json().catch(() => ({} as any))

  const limit = Number.isFinite(Number(body?.limit)) ? Math.max(1, Math.min(200, Number(body.limit))) : 25
  const ids = Array.isArray(body?.ids) ? body.ids.map(String).slice(0, 200) : undefined

  const result = await runActivitySweep({ limit, ids })
  return NextResponse.json({
    ok: true, ...result,
    message: result.checked === 0
      ? "Nothing to check: no firm is queued, or today's budget is spent."
      : `Checked ${result.checked} firms; ${result.withDate} published a dated investment.`,
  })
}

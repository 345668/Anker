/**
 * GET /api/cron/evals — nightly: run the invariant evals (the static ones and the live read-only ones), store the results, and fail loudly if any case fails,
 * so the stale-job monitor and the dependency check show it. docs/architecture/45 §2. Auth: Vercel Cron bearer CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"
import { runAll, store } from "@/lib/evals/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

async function handle(req: NextRequest) {
  if (!isCronAuthorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const outcomes = await runAll()
  await store(outcomes)
  const failed = outcomes.filter((o) => !o.ok)
  return NextResponse.json({ ok: failed.length === 0, total: outcomes.length, failed: failed.map((f) => ({ case: f.name, detail: f.detail })) }, { status: failed.length ? 500 : 200 })
}
export const GET = trackCron("evals", handle)

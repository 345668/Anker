/**
 * GET /api/cron/campaign-assessment
 *
 * Batch assessment engine. Picks up founder_submissions in status='received'
 * and runs each through the orchestrator: extract → conservative readiness gate
 * (auto-decline+feedback, or proceed) → dimensional matching → campaign creation
 * → batched email drafting → status='campaign_ready'. The campaign-send cron
 * takes it from there.
 *
 * Auth: Vercel Cron `Authorization: Bearer $CRON_SECRET` (or ?secret=). Fails
 * closed when CRON_SECRET is unset.
 *
 * ?limit=N   cap submissions this run (default CAMPAIGN_ASSESS_BATCH or 5)
 * ?id=<id>   process a single submission by id (manual trigger / testing)
 *
 * Idempotent: the orchestrator atomically claims 'received' → 'assessing', so an
 * overlapping tick or a re-run never double-processes.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { processSubmission } from "@/lib/campaign/orchestrator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if ((req.headers.get("authorization") || "") === `Bearer ${secret}`) return true
  return new URL(req.url).searchParams.get("secret") === secret
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const single = url.searchParams.get("id")
  const limit = Math.min(Number(url.searchParams.get("limit")) || Number(process.env.CAMPAIGN_ASSESS_BATCH) || 5, 25)

  let ids: string[]
  if (single) {
    ids = [single]
  } else {
    const rows = await sql`
      SELECT id FROM founder_submissions
      WHERE status = 'received'
      ORDER BY created_at ASC
      LIMIT ${limit}
    `
    ids = (rows as any[]).map((r) => r.id)
  }

  const results = []
  for (const id of ids) {
    results.push(await processSubmission(id))
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    declined: results.filter((r) => r.outcome === "declined").length,
    campaignsReady: results.filter((r) => r.outcome === "campaign_ready").length,
    failed: results.filter((r) => r.outcome === "failed").length,
    results,
  })
}

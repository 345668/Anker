/**
 * GET /api/cron/fit-ranker — monthly (docs/architecture/17 §5).
 *
 * Assembles the labels, fits the weights, evaluates them against the expert
 * weights on held-out data, and files the result. It activates a fit only when
 * every guard in doc 17 §3 passes; otherwise it records why it did not and the
 * expert weights keep ranking. Fails closed without CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server"
import { fitRanker } from "@/lib/matching/v2/ranker"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const report = await fitRanker({ triggerType: "scheduled" })
  console.log(`[fit-ranker] ${report.summary}`)
  return NextResponse.json({
    ok: true, activated: report.activate, summary: report.summary, blockedBy: report.blockedBy,
    counts: report.counts, metrics: report.metrics, weights: report.weights, fitId: report.id,
  })
}

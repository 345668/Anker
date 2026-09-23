/**
 * GET /api/founder/matching/runs/[runId]/results?kind=group|independent&page&limit&tier&emailStatus&q
 * Pages a persisted run's results (docs/architecture/14 §6). Workspace-scoped.
 */
import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { pageResults } from "@/lib/matching/v2/founder-runs"

export const runtime = "nodejs"
const TIERS = new Set(["champion", "priority_a", "priority_b", "prospect_c"])
const STATUSES = new Set(["valid", "risky", "unknown", "invalid"])

export async function GET(req: NextRequest, ctx: { params: Promise<{ runId: string }> }) {
  try {
    const context = await matchingContext("founder")
    const { runId } = await ctx.params
    const p = req.nextUrl.searchParams
    const kind = p.get("kind") === "independent" ? "independent" : "group"
    const tier = p.get("tier"), emailStatus = p.get("emailStatus")
    const data = await pageResults(runId, context, {
      kind, page: Number(p.get("page") ?? 1) || 1, limit: Number(p.get("limit") ?? 50) || 50,
      tier: tier && TIERS.has(tier) ? tier : null, emailStatus: emailStatus && STATUSES.has(emailStatus) ? emailStatus : null,
      q: (p.get("q") ?? "").slice(0, 100) || null,
    })
    if (!data) return NextResponse.json({ error: "Run not found or expired. Re-run matching." }, { status: 404 })
    return NextResponse.json({ kind, total: data.total, page: data.page, limit: data.limit, rows: data.rows })
  } catch (e) { return matchingFailure(e, "Results are temporarily unavailable.") }
}

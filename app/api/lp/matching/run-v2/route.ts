import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { LpMatchError, runLpMatch } from "@/lib/matching/lp/service"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 min — large datasets + AI enrichment

interface RunBody {
  fundProfileId: string
  minScore?: number
  maxFirms?: number
  maxContacts?: number
  enableAi?: boolean
  filters?: unknown
  includeKnown?: boolean
}

export async function POST(req: NextRequest) {
  try {
    const context = await matchingContext("vc")

    const body = (await req.json()) as RunBody
    if (!body.fundProfileId) {
      return NextResponse.json({ error: "fundProfileId is required" }, { status: 400 })
    }

    // The same service Anker AI and Telegram use (docs/architecture/63): one engine, one set of rules, one saved run for the workspace.
    const { result, filters, filterSummary, exclusionSummary } = await runLpMatch(
      { orgId: context.orgId, userId: context.userId, source: "page" },
      {
        fundProfileId: body.fundProfileId,
        options: { minScore: body.minScore, maxFirms: body.maxFirms, maxContacts: body.maxContacts, enableAi: body.enableAi },
        mandate: body.filters,
        includeKnown: body.includeKnown,
      },
    )

    // Return summary only (full lists can be fetched via session endpoint)
    return NextResponse.json({
      sessionId: result.sessionId,
      fundProfileId: result.fundProfileId,
      fundName: result.fundName,
      ranAt: result.ranAt,
      durationMs: result.durationMs,
      filters,
      filterSummary,
      exclusions: result.exclusions ?? null,
      exclusionSummary,
      totals: result.totals,
      tierCounts: result.tierCounts,
      segmentCounts: result.segmentCounts,
      funnel: result.funnel,
    })
  } catch (error: any) {
    if (error instanceof LpMatchError) {
      return NextResponse.json({ error: error.message, ...(error.missingFields ? { missingFields: error.missingFields } : {}) }, { status: error.status })
    }
    console.error("[LP Matching v2] Error:", error)
    return matchingFailure(error, "Matching could not finish. Please retry; if this continues, check the matching database migrations.")
  }
}

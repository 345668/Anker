import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { LpMatchError, runWithHandoff } from "@/lib/matching/lp/service"
import { sessionInWorkspace } from "@/lib/matching/lp/matches"
import { summaryOfSession } from "@/lib/matching/lp/summary"

export const runtime = "nodejs"
export const maxDuration = 300 // a run that outlasts the wait below keeps going in the background, within this limit

/** How long the request waits for a run before telling the page it is still going (the page then follows it by its id). */
const WAIT_MS = 8_000

interface RunBody {
  fundProfileId: string
  minScore?: number
  maxFirms?: number
  maxContacts?: number
  enableAi?: boolean
  filters?: unknown
  includeKnown?: boolean
}

/**
 * Start a run (docs/architecture/63 section 4.1). 200 with the summary when it finishes within a few seconds, which is the usual case; otherwise 202 with the run's id and where it
 * is, and the page follows it at .../sessions/[id]/status. The run is saved either way and appears in the workspace's history.
 */
export async function POST(req: NextRequest) {
  try {
    const context = await matchingContext("vc")

    const body = (await req.json()) as RunBody
    if (!body.fundProfileId) {
      return NextResponse.json({ error: "fundProfileId is required" }, { status: 400 })
    }

    const h = await runWithHandoff(
      { orgId: context.orgId, userId: context.userId, source: "page" },
      {
        fundProfileId: body.fundProfileId,
        options: { minScore: body.minScore, maxFirms: body.maxFirms, maxContacts: body.maxContacts, enableAi: body.enableAi },
        mandate: body.filters,
        includeKnown: body.includeKnown,
      },
      { waitMs: WAIT_MS },
    )
    if (h.kind === "running") return NextResponse.json({ sessionId: h.sessionId, status: "running", progress: h.progress }, { status: 202 })

    const s = await sessionInWorkspace(context.orgId, h.sessionId)
    if (!s) return NextResponse.json({ error: "The run finished but could not be read back." }, { status: 500 })
    return NextResponse.json(await summaryOfSession(context.orgId, s))
  } catch (error: any) {
    if (error instanceof LpMatchError) {
      return NextResponse.json({ error: error.message, ...(error.missingFields ? { missingFields: error.missingFields } : {}) }, { status: error.status })
    }
    console.error("[LP Matching v2] Error:", error)
    return matchingFailure(error, "Matching could not finish. Please retry; if this continues, check the matching database migrations.")
  }
}

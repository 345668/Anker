import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { sessionInWorkspace } from "@/lib/matching/lp/matches"
import { summaryOfSession } from "@/lib/matching/lp/summary"

export const dynamic = "force-dynamic"

/** The summary of a finished run, in the shape the run request returns when it finishes in time. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params
    const context = await matchingContext("vc")
    const s = await sessionInWorkspace(context.orgId, sessionId)
    return s ? NextResponse.json(await summaryOfSession(context.orgId, s)) : NextResponse.json({ error: "Run not found, or not finished." }, { status: 404 })
  } catch (error: any) { return matchingFailure(error, "The summary could not be read.") }
}

import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { sessionStatus } from "@/lib/matching/lp/service"

export const dynamic = "force-dynamic"

/** Where a run is: queued, running (with a position and a line of words), completed or failed. Any run of this workspace, whoever started it. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params
    const context = await matchingContext("vc")
    const st = await sessionStatus(context.orgId, sessionId)
    return st ? NextResponse.json(st) : NextResponse.json({ error: "Run not found in this workspace." }, { status: 404 })
  } catch (error: any) { return matchingFailure(error, "The run's status could not be read.") }
}

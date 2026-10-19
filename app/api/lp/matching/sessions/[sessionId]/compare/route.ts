import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { compareSessions } from "@/lib/matching/lp/matches"

/** What changed between this run and another of the workspace: ?with=<older run id> */
export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params
    const other = req.nextUrl.searchParams.get("with") || ""
    if (!other) return NextResponse.json({ error: "Say which run to compare with." }, { status: 400 })
    const context = await matchingContext("vc")
    // The newer run is the base, so "new" means new in the later one whichever way the two were chosen.
    const first = await compareSessions(context.orgId, sessionId, other)
    if (!first) return NextResponse.json({ error: "Run not found in this workspace." }, { status: 404 })
    return NextResponse.json(new Date(first.newer.createdAt) >= new Date(first.older.createdAt) ? first : await compareSessions(context.orgId, other, sessionId))
  } catch (error: any) { return matchingFailure(error, "The comparison could not be made.") }
}

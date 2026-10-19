import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { getMatch } from "@/lib/matching/lp/matches"

/** One suggested LP in full: reasons, gaps, confidence and how the engine scored it. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const { kind, id } = await params
    if (kind !== "firm" && kind !== "contact") return NextResponse.json({ error: "Unknown kind" }, { status: 400 })
    const context = await matchingContext("vc")
    const m = await getMatch(context.orgId, kind, id)
    return m ? NextResponse.json(m) : NextResponse.json({ error: "Match not found in this workspace." }, { status: 404 })
  } catch (error: any) {
    return matchingFailure(error, "The match could not be loaded.")
  }
}

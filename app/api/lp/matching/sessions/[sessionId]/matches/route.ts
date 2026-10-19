import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { listMatches, type MatchKind } from "@/lib/matching/lp/matches"

/** The ranked rows of a run: ?kind=firm|contact&tier=&confidence=&q=&hideJudged=1&limit=&offset= */
export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params
    const context = await matchingContext("vc")
    const u = req.nextUrl.searchParams
    const kind: MatchKind = u.get("kind") === "contact" ? "contact" : "firm"
    const out = await listMatches(context.orgId, sessionId, {
      kind, tier: u.get("tier") || undefined, confidence: u.get("confidence") || undefined, q: (u.get("q") || "").slice(0, 80) || undefined,
      hideJudged: u.get("hideJudged") === "1", limit: Number(u.get("limit")) || 50, offset: Number(u.get("offset")) || 0,
    })
    if (!out) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    return NextResponse.json(out)
  } catch (error: any) {
    return matchingFailure(error, "The matches could not be loaded.")
  }
}

import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { listSessions } from "@/lib/matching/lp/matches"

/** The workspace's finished runs, newest first: ?fundProfileId=&limit= */
export async function GET(req: NextRequest) {
  try {
    const context = await matchingContext("vc")
    const u = req.nextUrl.searchParams
    return NextResponse.json({ sessions: await listSessions(context.orgId, { fundProfileId: u.get("fundProfileId"), limit: Number(u.get("limit")) || 20 }) })
  } catch (error: any) { return matchingFailure(error, "The runs could not be loaded.") }
}

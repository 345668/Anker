import { NextRequest, NextResponse } from "next/server";
import { authorizedSession, matchingFailure } from "@/lib/matching/access";
import { getLpSession } from "@/lib/matching/lp-matchmaking";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    await authorizedSession(sessionId);
    const result = await getLpSession(sessionId);
    
    if (!result) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[LP Session API] Error:", error);
    return matchingFailure(error, "Session could not be loaded.");
  }
}

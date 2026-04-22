import { NextRequest, NextResponse } from "next/server";
import { getLpSession } from "@/lib/matching/lp-matchmaking";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const result = await getLpSession(sessionId);
    
    if (!result) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[LP Session API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

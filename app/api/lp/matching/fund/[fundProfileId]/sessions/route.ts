import { NextRequest, NextResponse } from "next/server";
import { getLpSessionsForFund } from "@/lib/matching/lp-matchmaking";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fundProfileId: string }> }
) {
  try {
    const { fundProfileId } = await params;
    const sessions = await getLpSessionsForFund(fundProfileId);
    return NextResponse.json(sessions);
  } catch (error: any) {
    console.error("[LP Sessions API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

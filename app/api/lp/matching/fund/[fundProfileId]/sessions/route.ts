import { authorizedProfile, matchingFailure } from "@/lib/matching/access";
import { NextRequest, NextResponse } from "next/server";
import { getLpSessionsForFund } from "@/lib/matching/lp-matchmaking";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fundProfileId: string }> }
) {
  try {
    const { fundProfileId } = await params;
    await authorizedProfile(fundProfileId);
    const sessions = await getLpSessionsForFund(fundProfileId);
    return NextResponse.json(sessions);
  } catch (error: any) {
    console.error("[LP Sessions API] Error:", error);
    return matchingFailure(error, "Records are temporarily unavailable.");
  }
}

import { authorizedMatch, matchingFailure } from "@/lib/matching/access";
import { NextRequest, NextResponse } from "next/server";
import { updateLpContactStatus } from "@/lib/matching/lp-matchmaking";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    await authorizedMatch(matchId, "contact");
    const { status, notes } = await req.json();
    
    await updateLpContactStatus(matchId, status, notes);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[LP Pipeline Contact] Error:", error);
    return matchingFailure(error, "Update could not be saved.");
  }
}

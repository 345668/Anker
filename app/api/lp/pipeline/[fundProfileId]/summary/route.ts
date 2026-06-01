import { NextRequest, NextResponse } from "next/server";
import { getLpPipelineSummary } from "@/lib/matching/lp-matchmaking";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fundProfileId: string }> }
) {
  try {
    const { fundProfileId } = await params;
    const summary = await getLpPipelineSummary(fundProfileId);
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error("[LP Pipeline Summary] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

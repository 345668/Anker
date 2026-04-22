import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { updateLpFirmStatus } from "@/lib/matching/lp-matchmaking";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  try {
    const { matchId } = await params;
    const { status, notes, commitmentAmount } = await req.json();
    
    // Get current match for event logging
    const [match] = await sql`
      SELECT * FROM lp_firm_matches WHERE id = ${matchId} LIMIT 1
    `;
    
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    
    await updateLpFirmStatus(matchId, status, notes, commitmentAmount);
    
    // Log pipeline event
    await sql`
      INSERT INTO lp_pipeline_events (
        id, fund_profile_id, entity_type, entity_id, entity_name,
        from_status, to_status, commitment_amount, notes, created_at
      ) VALUES (
        ${'lpe_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)},
        ${(match as any).fund_profile_id}, 'firm',
        ${(match as any).firm_id || matchId}, ${(match as any).firm_name},
        ${(match as any).status}, ${status}, ${commitmentAmount || null}, ${notes || null}, NOW()
      )
    `;
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[LP Pipeline Firm] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

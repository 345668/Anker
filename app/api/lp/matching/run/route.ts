import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { runLpMatching, saveLpSession, type FundProfile } from "@/lib/matching/lp-matchmaking";

export async function POST(req: NextRequest) {
  try {
    const { fundProfileId, minScore, maxFirms, maxContacts } = await req.json();
    
    if (!fundProfileId) {
      return NextResponse.json({ error: "fundProfileId is required" }, { status: 400 });
    }
    
    // Load fund profile - use correct column names from fund_profiles table
    const [profileRow] = await sql`
      SELECT * FROM fund_profiles WHERE id = ${fundProfileId} LIMIT 1
    `;
    
    if (!profileRow) {
      return NextResponse.json({ error: "Fund profile not found" }, { status: 404 });
    }
    
    // Map to FundProfile interface using actual database column names
    const profile = profileRow as any;
    const fundProfile: FundProfile = {
      id: profile.id,
      name: profile.fund_name,
      targetRaise: profile.target_fund_size,
      sectors: Array.isArray(profile.target_sectors) ? profile.target_sectors : [],
      geographicFocus: Array.isArray(profile.target_geographies) ? profile.target_geographies : [],
      headquartersLocation: null, // Not in table
      thesisKeywords: [], // Not in table, could extract from notes
      scoringWeights: undefined,
    };
    
    console.log(`[LP Matching API] Starting LP matching for fund: ${fundProfile.name}`);
    
    const result = await runLpMatching(fundProfile, { minScore, maxFirms, maxContacts });
    
    // Save session to database
    await saveLpSession(result, fundProfileId);
    
    // Return summary (without full firm/contact arrays for response size)
    return NextResponse.json({
      sessionId: result.sessionId,
      fundName: result.fundName,
      totalFirmsScored: result.totalFirmsScored,
      totalContactsScored: result.totalContactsScored,
      qualifiedFirms: result.qualifiedFirms,
      qualifiedContacts: result.qualifiedContacts,
      contactsWithEmail: result.contactsWithEmail,
      anchorCandidates: result.anchorCandidates,
      durationMs: result.durationMs,
      tierCounts: result.tierCounts,
    });
  } catch (error: any) {
    console.error("[LP Matching API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

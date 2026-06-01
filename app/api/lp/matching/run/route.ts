import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { runLpMatching, saveLpSession, type FundProfile } from "@/lib/matching/lp-matchmaking";

export async function POST(req: NextRequest) {
  try {
    const { fundProfileId, minScore, maxFirms, maxContacts } = await req.json();
    
    if (!fundProfileId) {
      return NextResponse.json({ error: "fundProfileId is required" }, { status: 400 });
    }
    
    // Load fund profile
    const [profileRow] = await sql`
      SELECT * FROM fund_profiles WHERE id = ${fundProfileId} AND is_active = true LIMIT 1
    `;
    
    if (!profileRow) {
      return NextResponse.json({ error: "Fund profile not found" }, { status: 404 });
    }
    
    // Map to FundProfile interface
    const profile = profileRow as any;
    const fundProfile: FundProfile = {
      id: profile.id,
      name: profile.name,
      targetRaise: profile.target_raise,
      sectors: Array.isArray(profile.sectors) ? profile.sectors : JSON.parse(profile.sectors || "[]"),
      geographicFocus: Array.isArray(profile.geographic_focus) ? profile.geographic_focus : JSON.parse(profile.geographic_focus || "[]"),
      headquartersLocation: profile.headquarters_location,
      thesisKeywords: Array.isArray(profile.thesis_keywords) ? profile.thesis_keywords : JSON.parse(profile.thesis_keywords || "[]"),
      scoringWeights: profile.scoring_weights ? (typeof profile.scoring_weights === "string" ? JSON.parse(profile.scoring_weights) : profile.scoring_weights) : undefined,
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

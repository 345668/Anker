import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// GET all fund profiles
export async function GET() {
  try {
    const profiles = await sql`
      SELECT * FROM fund_profiles 
      WHERE is_active = true 
      ORDER BY created_at DESC
    `;
    return NextResponse.json(profiles);
  } catch (error: any) {
    console.error("[LP Fund Profiles] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST create fund profile
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const id = `fp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    
    await sql`
      INSERT INTO fund_profiles (
        id, name, target_raise, hard_cap, minimum_commitment, fund_life,
        management_fee, carry, gp_commitment, structure, legal_structure,
        waterfall_type, investment_stage, avg_check_size, target_companies,
        investment_period, sectors, geographic_focus, headquarters_location,
        target_lp_types, thesis_description, thesis_keywords, value_proposition,
        gp_name, gp_track_record, portfolio_companies, university_partners,
        corporate_partners, placement_agent, return_scenarios, first_close_date,
        final_close_date, scoring_weights, user_id, is_active, created_at, updated_at
      ) VALUES (
        ${id}, ${data.name}, ${data.targetRaise || null}, ${data.hardCap || null},
        ${data.minimumCommitment || null}, ${data.fundLife || null},
        ${data.managementFee || null}, ${data.carry || null}, ${data.gpCommitment || null},
        ${data.structure || null}, ${data.legalStructure || null},
        ${data.waterfallType || null}, ${data.investmentStage || null},
        ${data.avgCheckSize || null}, ${data.targetCompanies || null},
        ${data.investmentPeriod || null},
        ${JSON.stringify(data.sectors || [])}, ${JSON.stringify(data.geographicFocus || [])},
        ${data.headquartersLocation || null}, ${JSON.stringify(data.targetLpTypes || [])},
        ${data.thesisDescription || null}, ${JSON.stringify(data.thesisKeywords || [])},
        ${data.valueProposition || null}, ${data.gpName || null},
        ${JSON.stringify(data.gpTrackRecord || [])}, ${JSON.stringify(data.portfolioCompanies || [])},
        ${JSON.stringify(data.universityPartners || [])}, ${JSON.stringify(data.corporatePartners || [])},
        ${data.placementAgent || null}, ${JSON.stringify(data.returnScenarios || [])},
        ${data.firstCloseDate ? new Date(data.firstCloseDate) : null},
        ${data.finalCloseDate ? new Date(data.finalCloseDate) : null},
        ${data.scoringWeights ? JSON.stringify(data.scoringWeights) : null},
        ${data.userId || null}, true, NOW(), NOW()
      )
    `;
    
    const [profile] = await sql`SELECT * FROM fund_profiles WHERE id = ${id}`;
    return NextResponse.json(profile);
  } catch (error: any) {
    console.error("[LP Fund Profiles] Error creating:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

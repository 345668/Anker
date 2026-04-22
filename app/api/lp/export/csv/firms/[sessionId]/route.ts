import { NextRequest, NextResponse } from "next/server";
import { getLpSession, type ScoredFirm } from "@/lib/matching/lp-matchmaking";
import { generateLpFirmsCsv } from "@/lib/matching/xlsx-generator";

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
    
    const firms: ScoredFirm[] = result.firms.map((f: any) => {
      const tags = typeof f.tags === "string" ? JSON.parse(f.tags) : (f.tags || []);
      const reasons = typeof f.reasons === "string" ? JSON.parse(f.reasons) : (f.reasons || []);
      return {
        firmId: f.firm_id,
        name: f.firm_name ?? "",
        type: f.firm_type ?? "",
        location: f.firm_location ?? "",
        aum: f.firm_aum ?? "",
        sectors: f.firm_sectors ?? "",
        website: f.firm_website ?? "",
        linkedin: f.firm_linkedin ?? "",
        score: f.score,
        tier: f.tier ?? "",
        tierLabel: "",
        tags,
        reasons,
        factorLpType: 0,
        factorAum: 0,
        factorSector: 0,
        factorGeo: 0,
        factorThesisSignals: 0,
      };
    });
    
    const csv = generateLpFirmsCsv(firms);
    
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="lp_firms_${sessionId}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("[LP Export CSV Firms] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

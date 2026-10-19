import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { sessionInWorkspace } from "@/lib/matching/lp/matches"

/** The summary of one finished run of this workspace. The ranked rows are at ./matches. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params
    const context = await matchingContext("vc")
    const s = await sessionInWorkspace(context.orgId, sessionId)
    if (!s) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    return NextResponse.json({
      sessionId: s.id, fundProfileId: s.fund_profile_id, fundName: s.fund_name, createdAt: s.created_at, source: s.source ?? "page", parentSessionId: s.parent_session_id ?? null,
      filters: s.filters_applied ?? null, exclusions: s.exclusion_counts ?? null, confidence: s.confidence_counts ?? null,
      totals: { qualifiedFirms: s.qualified_firms, qualifiedContacts: s.qualified_contacts, contactsWithEmail: s.contacts_with_email, anchorCandidates: s.anchor_candidates },
      tierCounts: s.tier_counts ?? null,
    })
  } catch (error: any) {
    console.error("[LP Session API] Error:", error)
    return matchingFailure(error, "Session could not be loaded.")
  }
}

import { matchingContext, MatchingError } from "@/lib/matching/access"
import { serializeFundProfile } from "@/lib/matching/fund-profile"
import { sql } from "@/lib/db"
import { MatchmakingContent } from "@/components/tesseract/matchmaking-content"

export const dynamic = "force-dynamic"

export default async function MatchmakingPage() {
  // Load active fund profiles + recent v2 sessions
  let fundProfiles: any[] = []
  let recentSessions: any[] = []
  let loadError: string | null = null
  try {
    const context = await matchingContext("vc")
    fundProfiles = await sql`
      SELECT *
      FROM fund_profiles
      WHERE is_active = true AND user_id=${context.userId} AND org_id=${context.orgId}
      ORDER BY created_at DESC
      LIMIT 50
    `
    recentSessions = await sql`
      SELECT id, fund_profile_id, fund_name, qualified_firms, qualified_contacts,
             contacts_with_email, anchor_candidates, ai_enrichments_applied,
             duplicates_merged, duration_ms, created_at, engine_version
      FROM lp_match_sessions
      WHERE status='completed' AND user_id=${context.userId} AND fund_profile_id IN (SELECT id FROM fund_profiles WHERE org_id=${context.orgId})
      ORDER BY created_at DESC
      LIMIT 10
    `
  } catch (error) {
    loadError = error instanceof MatchingError ? error.message : "Matching profiles could not be loaded. Check the matching migration and try again."
  }

  return (
    <MatchmakingContent
      loadError={loadError}
      fundProfiles={fundProfiles.map((f: any) => ({
        ...serializeFundProfile(f),
        id: f.id,
        name: f.name,
        targetRaise: f.target_raise == null ? null : Number(f.target_raise),
        headquarters: f.headquarters_location ?? null,
        sectors: parseJsonField(f.sectors),
        primarySectors: parseJsonField(f.primary_sectors),
      }))}
      recentSessions={recentSessions.map((s: any) => ({
        id: s.id,
        fundProfileId: s.fund_profile_id,
        fundName: s.fund_name,
        qualifiedFirms: s.qualified_firms,
        qualifiedContacts: s.qualified_contacts,
        contactsWithEmail: s.contacts_with_email,
        anchorCandidates: s.anchor_candidates,
        aiEnrichmentsApplied: s.ai_enrichments_applied ?? 0,
        duplicatesMerged: s.duplicates_merged ?? 0,
        durationMs: s.duration_ms ?? 0,
        createdAt: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at),
        engineVersion: s.engine_version ?? "v1",
      }))}
    />
  )
}

function parseJsonField(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[]
  if (typeof v === "string") {
    try {
      return JSON.parse(v)
    } catch {
      return []
    }
  }
  return []
}

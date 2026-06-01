import { sql } from "@/lib/db"
import { MatchmakingContent } from "@/components/tesseract/matchmaking-content"

export const dynamic = "force-dynamic"

export default async function MatchmakingPage() {
  // Load active fund profiles + recent v2 sessions
  let fundProfiles: any[] = []
  let recentSessions: any[] = []
  try {
    fundProfiles = await sql`
      SELECT id, name, target_raise, headquarters_location, sectors, primary_sectors
      FROM fund_profiles
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT 50
    `
    recentSessions = await sql`
      SELECT id, fund_profile_id, fund_name, qualified_firms, qualified_contacts,
             contacts_with_email, anchor_candidates, ai_enrichments_applied,
             duplicates_merged, duration_ms, created_at, engine_version
      FROM lp_match_sessions
      ORDER BY created_at DESC
      LIMIT 10
    `
  } catch {
    // Tables may not exist in stub env — render empty state
  }

  return (
    <MatchmakingContent
      fundProfiles={fundProfiles.map((f: any) => ({
        id: f.id,
        name: f.name,
        targetRaise: f.target_raise ?? null,
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

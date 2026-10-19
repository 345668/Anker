import { matchingContext, MatchingError } from "@/lib/matching/access"
import { serializeFundProfile } from "@/lib/matching/fund-profile"
import { sql } from "@/lib/db"
import { listSessions } from "@/lib/matching/lp/matches"
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
      WHERE is_active = true AND org_id=${context.orgId}
      ORDER BY created_at DESC
      LIMIT 50
    `
    recentSessions = await listSessions(context.orgId, { limit: 20 })
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
      recentSessions={recentSessions}
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

/** GET /api/founder/matching/runs — this workspace's run history (newest first). */
import { NextResponse } from "next/server"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { listRuns } from "@/lib/matching/v2/founder-runs"

export const runtime = "nodejs"

export async function GET() {
  try {
    const context = await matchingContext("founder")
    const runs = await listRuns(context, 20)
    return NextResponse.json({
      runs: runs.map((r) => ({
        id: r.id, createdAt: r.createdAt, engineVersion: r.engineVersion, startupName: r.startupName,
        groups: r.totals?.qualifiedFirms ?? 0, independents: (r.totals?.qualifiedContacts ?? 0), semantic: r.semantic?.status ?? null,
        tierCounts: r.tierCounts,
      })),
    })
  } catch (e) { return matchingFailure(e, "Run history is temporarily unavailable.") }
}

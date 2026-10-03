/**
 * GET /api/cron/directory-normalize — daily (docs/architecture/14 §9).
 * Normalises changed directory rows, then rebuilds the Discover facets.
 * Fails closed without CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server"
import { normalizeDirectory, rebuildFacets } from "@/lib/platform/directory-normalize"
import { trackCron } from "@/lib/cron/track"

export const runtime = "nodejs"
export const maxDuration = 300

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const normalized = await normalizeDirectory(20_000)
  const facets = await rebuildFacets()
  return NextResponse.json({ ok: true, normalized, facets })
}

// Every run is recorded in cron_runs (lib/cron/track.ts); the handler above is unchanged.
export const GET = trackCron("directory-normalize", handle)

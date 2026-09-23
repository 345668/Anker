/**
 * GET  /api/founder/profile — the workspace's latest saved startup profile
 * POST /api/founder/profile { fields, provenance } — save a new version
 * (docs/architecture/14 §8). Unchanged profiles do not create a version.
 */
import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure, MatchingError } from "@/lib/matching/access"
import { latestProfile, saveProfile } from "@/lib/matching/v2/founder-runs"

export const runtime = "nodejs"
const PROVENANCE = new Set(["deck", "typed", "workspace", "override"])

export async function GET() {
  try {
    const context = await matchingContext("founder")
    return NextResponse.json({ profile: await latestProfile(context) })
  } catch (e) { return matchingFailure(e, "The saved profile is temporarily unavailable.") }
}

export async function POST(req: NextRequest) {
  try {
    const context = await matchingContext("founder")
    const body = await req.json()
    if (!body || typeof body.fields !== "object" || Array.isArray(body.fields)) throw new MatchingError("Send the profile fields.", 400)
    const raw = JSON.stringify(body.fields)
    if (raw.length > 100_000) throw new MatchingError("The profile is too large.", 413)
    const provenance: Record<string, string> = {}
    for (const [k, v] of Object.entries(body.provenance ?? {})) if (typeof v === "string" && PROVENANCE.has(v) && k.length <= 60) provenance[k] = v
    const saved = await saveProfile(context, body.fields, provenance)
    return NextResponse.json({ ok: true, ...saved })
  } catch (e) { return matchingFailure(e, "The profile could not be saved.") }
}

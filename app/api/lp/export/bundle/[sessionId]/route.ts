import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { loadSessionResult } from "@/lib/matching/lp/session-result"
import { buildBundle } from "@/lib/matching/lp/bundle"

export const runtime = "nodejs"
export const maxDuration = 60

/** Everything a run produces in one zip: workbook, firms and people as CSV, the methodology note and the meeting agenda. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params
    const context = await matchingContext("vc")
    const loaded = await loadSessionResult(context.orgId, sessionId)
    if (!loaded) return NextResponse.json({ error: "Session not found in this workspace." }, { status: 404 })
    const { name, bytes } = buildBundle(loaded.result, loaded.fund)
    return new NextResponse(bytes as unknown as BodyInit, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"` } })
  } catch (error) { return matchingFailure(error, "The download is temporarily unavailable.") }
}

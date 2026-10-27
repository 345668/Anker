import { NextRequest, NextResponse } from "next/server"
import { halyardContext, halyardFailure, inWorkspaceAi } from "@/lib/halyard/route"
import { completeForDesktop } from "@/lib/halyard/provider"
import { HalyardError } from "@/lib/halyard/sessions"
import { rateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 60
/**
 * { system, text, maxTokens?, action? } -> { text, model }. One completion through the workspace's AI for the Halyard desktop app ("Anker AI" provider). Device key or signed-in person.
 * Metered against the monthly allowance, policy-checked, recorded in ai_calls for the workspace; stops when the kill switch is off.
 */
export async function POST(req: NextRequest) {
  try {
    const c = await halyardContext()
    if (!rateLimit(`halyard-ai:${c.userId}`, { limit: 40, windowMs: 60_000 }).ok) throw new HalyardError("Slow down: too many requests in the last minute.", 429, "rate")
    const b = await req.json()
    return NextResponse.json(await inWorkspaceAi(c, req.signal, () => completeForDesktop(c.orgId, b)))
  } catch (e) { return halyardFailure(e) }
}

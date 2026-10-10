/**
 * POST /api/vc/raise-path/drafts { limit? }: write up to 10 first-wave drafts for the top LPs as proposals in the Actions inbox. Nothing is sent and nothing is saved until the partner approves.
 */
import { NextResponse } from "next/server"
import { requireCrmWorkspace } from "@/lib/crm/workspace"
import { workspaceError } from "@/lib/auth/workspace-context"
import { rateLimit, AI_HEAVY } from "@/lib/rate-limit"
import { draftLpWave, WaveError, WAVE_PER_REQUEST } from "@/lib/vc/lp-wave"
export const runtime = "nodejs"
export const maxDuration = 120
export async function POST(req: Request) {
  try {
    const scope = await requireCrmWorkspace(true)
    if (scope.persona !== "vc")
      return NextResponse.json({ error: "This is for fund workspaces." }, { status: 400 })
    if (!rateLimit(`raise-drafts:${scope.userId}`, AI_HEAVY).ok)
      return NextResponse.json({ error: "Too many requests. Wait a minute." }, { status: 429 })
    const body = (await req.json().catch(() => ({}))) as { limit?: unknown }
    const limit = Number.isInteger(body.limit)
      ? Math.min(Math.max(1, Number(body.limit)), WAVE_PER_REQUEST)
      : WAVE_PER_REQUEST
    const r = await draftLpWave({ orgId: scope.orgId, userId: scope.userId, persona: scope.persona }, limit)
    return NextResponse.json(r, { headers: { "Cache-Control": "private, no-store" } })
  } catch (e) {
    if (e instanceof WaveError) return NextResponse.json({ error: e.message }, { status: e.status })
    return workspaceError(e)
  }
}

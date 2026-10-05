/** PUT /api/agents/settings { agentId, enabled } — owner or admin switches an agent on or off for the workspace. */
import { NextRequest, NextResponse } from "next/server"
import { requireDecider } from "@/lib/actions/session"
import { definitionsFor } from "@/lib/agents/runtime/definitions"
import { setEnabled } from "@/lib/agents/runtime/engine"

export const runtime = "nodejs"

export async function PUT(req: NextRequest) {
  const who = await requireDecider("autonomy")
  if (who instanceof NextResponse) return who
  const b = await req.json().catch(() => ({}))
  if (typeof b?.enabled !== "boolean" || typeof b?.agentId !== "string") return NextResponse.json({ error: "agentId and enabled are required." }, { status: 400 })
  if (!definitionsFor(who.persona).some((d) => d.id === b.agentId)) return NextResponse.json({ error: "That agent is not available for this workspace." }, { status: 404 })
  await setEnabled(who.orgId, b.agentId, b.enabled, { userId: who.userId, email: who.email })
  return NextResponse.json({ ok: true })
}

/** POST /api/agents/run { agentId, mode: "live" | "dry_run" } — a signed-in person runs an agent now. Never callable by the assistant. */
import { NextRequest, NextResponse } from "next/server"
import { requireDecider } from "@/lib/actions/session"
import { definitionsFor } from "@/lib/agents/runtime/definitions"
import { createExecution, runExecution } from "@/lib/agents/runtime/engine"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const who = await requireDecider()
  if (who instanceof NextResponse) return who
  const b = await req.json().catch(() => ({}))
  if (!definitionsFor(who.persona).some((d) => d.id === b?.agentId)) return NextResponse.json({ error: "That agent is not available for this workspace." }, { status: 404 })
  const mode = b?.mode === "dry_run" ? "dry_run" : "live"
  const id = await createExecution(who.orgId, b.agentId, { trigger: "manual", mode, requestedBy: who.userId })
  if (!id) return NextResponse.json({ error: "Could not start the run." }, { status: 500 })
  const run = await runExecution(id, undefined, { deadlineAt: Date.now() + 45_000 })
  return NextResponse.json({ execution: run })
}

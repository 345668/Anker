/** GET /api/memory — what this workspace has asked the system to remember. POST writes one directly (pinned: no agent can replace it). */
import { NextRequest, NextResponse } from "next/server"
import { requireWorkspace, workspaceError } from "@/lib/auth/workspace-context"
import { requireDecider } from "@/lib/actions/session"
import { listMemory, writeByPerson } from "@/lib/memory/store"

export const runtime = "nodejs"

export async function GET() {
  try {
    const scope = await requireWorkspace(false)
    return NextResponse.json({ memory: await listMemory(scope.orgId), canManage: ["workspace_owner", "admin"].includes(scope.role) })
  } catch (e) { return workspaceError(e) }
}

export async function POST(req: NextRequest) {
  const who = await requireDecider()
  if (who instanceof NextResponse) return who
  const b = await req.json().catch(() => ({}))
  if (typeof b?.entryId !== "string" || typeof b?.key !== "string" || typeof b?.value !== "string" || !b.value.trim()) return NextResponse.json({ error: "entryId, key and value are required." }, { status: 400 })
  try { await writeByPerson(who.orgId, b.entryId, b.key.trim(), b.value.trim(), { userId: who.userId, email: who.email }, typeof b.validUntil === "string" && b.validUntil ? new Date(b.validUntil).toISOString() : null); return NextResponse.json({ ok: true }) }
  catch (e: any) { return NextResponse.json({ error: String(e?.message ?? e) }, { status: 400 }) }
}

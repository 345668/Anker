/** DELETE /api/memory/<id> — owner or admin makes the system forget one entry. Audited. */
import { NextRequest, NextResponse } from "next/server"
import { requireDecider } from "@/lib/actions/session"
import { deleteMemory } from "@/lib/memory/store"

export const runtime = "nodejs"

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const who = await requireDecider("autonomy")
  if (who instanceof NextResponse) return who
  const ok = await deleteMemory(who.orgId, (await ctx.params).id, { userId: who.userId, email: who.email })
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found." }, { status: 404 })
}

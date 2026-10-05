/** POST /api/actions/<id> { decision: "approve" | "reject" | "undo" } — a signed-in person decides one proposal. */
import { NextRequest, NextResponse } from "next/server"
import { requireDecider } from "@/lib/actions/session"
import { decide } from "@/lib/actions/store"
import { ActionError } from "@/lib/actions/capabilities"

export const runtime = "nodejs"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const who = await requireDecider()
  if (who instanceof NextResponse) return who
  const b = await req.json().catch(() => ({}))
  if (!["approve", "reject", "undo"].includes(b?.decision)) return NextResponse.json({ error: "decision must be approve, reject or undo." }, { status: 400 })
  try {
    const r = await decide(who.orgId, (await ctx.params).id, b.decision, { userId: who.userId, email: who.email }, { typedCount: Number.isInteger(b.typedCount) ? b.typedCount : null })
    return NextResponse.json({ proposal: r.proposal, message: r.message })
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: 409 })
    throw e
  }
}

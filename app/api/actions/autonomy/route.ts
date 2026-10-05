/** PUT /api/actions/autonomy { riskClass: "R0", autoCommit: boolean } — owner or admin only; R1 to R3 can never be switched on. */
import { NextRequest, NextResponse } from "next/server"
import { requireDecider } from "@/lib/actions/session"
import { setAutonomy } from "@/lib/actions/store"
import { ActionError } from "@/lib/actions/capabilities"

export const runtime = "nodejs"

export async function PUT(req: NextRequest) {
  const who = await requireDecider("autonomy")
  if (who instanceof NextResponse) return who
  const b = await req.json().catch(() => ({}))
  if (typeof b?.autoCommit !== "boolean") return NextResponse.json({ error: "autoCommit must be true or false." }, { status: 400 })
  try { await setAutonomy(who.orgId, b.riskClass ?? "R0", b.autoCommit, { userId: who.userId, email: who.email }); return NextResponse.json({ ok: true }) }
  catch (e) { if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: 400 }); throw e }
}

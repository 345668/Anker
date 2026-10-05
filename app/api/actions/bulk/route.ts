/** POST /api/actions/bulk { ids: string[], decision: "approve" | "reject" } — decide a group (one run's proposals); each is still applied once on its own. */
import { NextRequest, NextResponse } from "next/server"
import { requireDecider } from "@/lib/actions/session"
import { decide } from "@/lib/actions/store"
import { sql } from "@/lib/db"
import { bulkApprovable } from "@/lib/actions/model"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const who = await requireDecider()
  if (who instanceof NextResponse) return who
  const b = await req.json().catch(() => ({}))
  if (!Array.isArray(b?.ids) || b.ids.length === 0 || b.ids.length > 200 || !b.ids.every((x: unknown) => typeof x === "string")) return NextResponse.json({ error: "ids must be 1 to 200 proposal ids." }, { status: 400 })
  if (!["approve", "reject"].includes(b?.decision)) return NextResponse.json({ error: "decision must be approve or reject." }, { status: 400 })
  const results: Array<{ id: string; ok: boolean; message: string }> = []
  for (const id of b.ids as string[]) {
    try {
      // Sending is never approved in bulk: each batch is read and approved on its own (docs/architecture/46 §6).
      const [p] = (await sql`SELECT risk_class FROM action_proposals WHERE id = ${id} AND org_id = ${who.orgId}`) as any[]
      if (p && !bulkApprovable(p.risk_class) && b.decision === "approve") { results.push({ id, ok: false, message: "Sending is approved one batch at a time. Open it and approve it on its own." }); continue }
      const r = await decide(who.orgId, id, b.decision, { userId: who.userId, email: who.email }); results.push({ id, ok: r.proposal.status !== "failed", message: r.message }) }
    catch (e: any) { results.push({ id, ok: false, message: String(e?.message ?? e) }) }
  }
  return NextResponse.json({ results })
}

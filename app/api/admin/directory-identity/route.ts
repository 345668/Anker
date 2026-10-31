/**
 * Called by SAIL (docs/architecture/55). Portal service principal only. Every change is attributed to the staff member (x-portal-staff-email) and audited by SAIL; no names are returned or logged.
 *   POST (no body)                                  run detection now (E1): changes no directory data
 *   POST { action: "plan",  candidateId, survivorId }   what a merge WOULD do: fills, conflicts, references, anything that forbids it
 *   POST { action: "merge", candidateId, survivorId, reason? }   merge a pair confirmed as the same (E2 people, E3 firms); one atomic statement, undoable for 90 days
 *   POST { action: "undo",  mergeId }                put a merged record back (E2, E3)
 *   POST { action: "related", candidateId }          apply a decision "related" as one level of hierarchy (E3)
 *   GET  ?merges=1                                   the recent merges, for the undo list
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { runDetection } from "@/lib/directory/candidates"
import { executeMerge, MergeError, planMerge, setParent, undoMerge } from "@/lib/directory/merge"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const staffOf = (req: NextRequest) => req.headers.get("x-portal-staff-email") ?? "staff"
async function guard(): Promise<NextResponse | null> {
  const g = await requireAdmin()
  if (g instanceof NextResponse) return g
  return g.id === "portal-service" ? null : NextResponse.json({ error: "Only available through the staff portal." }, { status: 403 })
}
const fail = (e: unknown) => {
  if (e instanceof MergeError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
  console.error("[directory-identity]", (e as Error)?.message); return NextResponse.json({ error: "That could not be completed." }, { status: 500 })
}
export async function GET(req: NextRequest) {
  const denied = await guard(); if (denied) return denied
  if (!req.nextUrl.searchParams.has("merges")) return NextResponse.json({ error: "Nothing to read." }, { status: 400 })
  const rows = (await sql`SELECT id, kind, survivor_id, loser_id, by_staff, reason, filled, conflicts, undo_until, undone_at, created_at FROM directory_merges ORDER BY id DESC LIMIT 50`) as any[]
  return NextResponse.json({ merges: rows.map((r) => ({ id: Number(r.id), kind: r.kind, survivorId: r.survivor_id, loserId: r.loser_id, by: r.by_staff, reason: r.reason, filled: r.filled, conflicts: r.conflicts, undoUntil: r.undo_until, undoneAt: r.undone_at, at: r.created_at })) })
}
export async function POST(req: NextRequest) {
  const denied = await guard(); if (denied) return denied
  const b = await req.json().catch(() => null)
  if (!b || !b.action) {
    try { return NextResponse.json(await runDetection()) } catch (e) { console.error("[directory-identity]", (e as Error).message); return NextResponse.json({ error: "Detection failed." }, { status: 500 }) }
  }
  try {
    const by = staffOf(req)
    if (b.action === "undo") return NextResponse.json(await undoMerge(Number(b.mergeId), by))
    const [c] = (await sql`SELECT id, kind, a_id, b_id, status, parent_id FROM directory_candidates WHERE id = ${Number(b.candidateId)}`) as any[]
    if (!c) return NextResponse.json({ error: "That pair was not found." }, { status: 404 })
    if (b.action === "related") {
      if (c.kind !== "firm" || c.status !== "related" || !c.parent_id) return NextResponse.json({ error: "Only a firm pair decided as related, with its parent named, can be applied as a hierarchy." }, { status: 409 })
      const child = c.parent_id === c.a_id ? c.b_id : c.a_id; await setParent(child, c.parent_id); return NextResponse.json({ ok: true, parentId: c.parent_id, childId: child })
    }
    const survivorId = String(b.survivorId ?? "")
    if (![c.a_id, c.b_id].includes(survivorId)) return NextResponse.json({ error: "The survivor must be one of the two records." }, { status: 400 })
    const loserId = survivorId === c.a_id ? c.b_id : c.a_id
    if (b.action === "plan") return NextResponse.json(await planMerge(c.kind, survivorId, loserId))
    if (b.action === "merge") return NextResponse.json(await executeMerge({ kind: c.kind, survivorId, loserId, candidateId: Number(c.id), by, reason: typeof b.reason === "string" ? b.reason : null }))
    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) { return fail(e) }
}

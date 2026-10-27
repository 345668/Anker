import { NextRequest, NextResponse } from "next/server"
import { sessionContext, halyardFailure, publicSession } from "@/lib/halyard/route"
import { deleteSession, latestBrief, listTurns, setState } from "@/lib/halyard/sessions"
import { sql } from "@/lib/db"
import { decryptSecret } from "@/lib/db/secrets"

export const runtime = "nodejs"
type P = { params: Promise<{ id: string }> }
/** State, a page of the transcript (?after=seq), the brief and the suggestions so far. */
export async function GET(req: NextRequest, { params }: P) {
  try {
    const { session } = await sessionContext((await params).id)
    const after = Number(req.nextUrl.searchParams.get("after") ?? -1)
    const turns = await listTurns(session.id, { afterSeq: Number.isFinite(after) ? after : -1, limit: 500 })
    const brief = await latestBrief(session.id)
    const [{ last }] = (await sql`SELECT COALESCE(max(seq), -1)::int AS last FROM halyard_segments WHERE session_id = ${session.id}`) as any[]
    const sug = (await sql`SELECT id, action, requested_at, total_ms, text_enc, used, rating FROM halyard_suggestions WHERE session_id = ${session.id} ORDER BY requested_at`) as any[]
    return NextResponse.json({ session: publicSession(session), lastSeq: last, turns, brief: brief ? { version: brief.version, text: brief.brief, figures: brief.figures } : null,
      suggestions: sug.map((r) => ({ id: r.id, action: r.action, at: r.requested_at, ms: r.total_ms, text: decryptSecret(r.text_enc), used: r.used, rating: r.rating })) })
  } catch (e) { return halyardFailure(e) }
}
/** { state: "paused" | "live" } */
export async function PATCH(req: NextRequest, { params }: P) {
  try {
    const { session } = await sessionContext((await params).id), b = await req.json()
    if (b?.state !== "paused" && b?.state !== "live") return NextResponse.json({ error: "state must be paused or live." }, { status: 400 })
    return NextResponse.json({ session: publicSession(await setState(session, b.state)) })
  } catch (e) { return halyardFailure(e) }
}
/** Deletes everything of the session, including the call it made. */
export async function DELETE(_req: NextRequest, { params }: P) {
  try { const { session } = await sessionContext((await params).id); await deleteSession(session); return NextResponse.json({ ok: true }) } catch (e) { return halyardFailure(e) }
}

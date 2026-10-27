import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { halyardContext, halyardFailure, publicSession } from "@/lib/halyard/route"

export const runtime = "nodejs"
/** ?q= searches the person's sessions by title and by the linked call's summary and transcript (session text itself is encrypted, so it is searched through the call record). */
export async function GET(req: NextRequest) {
  try {
    const c = await halyardContext(false), q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100)
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`
    const rows = (q
      ? await sql`SELECT s.* FROM halyard_sessions s LEFT JOIN investor_calls ic ON ic.id = s.call_id AND ic.org_id = s.org_id AND ic.deleted_at IS NULL
          WHERE s.org_id = ${c.orgId} AND s.user_id = ${c.userId} AND (s.title ILIKE ${like} OR ic.summary ILIKE ${like} OR ic.transcript ILIKE ${like}) ORDER BY s.started_at DESC LIMIT 50`
      : await sql`SELECT * FROM halyard_sessions WHERE org_id = ${c.orgId} AND user_id = ${c.userId} ORDER BY started_at DESC LIMIT 50`) as any[]
    return NextResponse.json({ sessions: rows.map(publicSession) })
  } catch (e) { return halyardFailure(e) }
}

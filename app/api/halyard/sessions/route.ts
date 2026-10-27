import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { halyardContext, halyardFailure, publicSession } from "@/lib/halyard/route"
import { createSession } from "@/lib/halyard/sessions"

export const runtime = "nodejs"
/** POST { mode, title, language, crmEntryId, consentAttested, participantsInformed } — starts a session. Refused without the attestation, the plan, a live allowance and room for another session. */
export async function POST(req: NextRequest) {
  try {
    const c = await halyardContext(), b = await req.json()
    const device = c.via === "device"   // a paired desktop app: its own source, its own device, and it sends text it has already transcribed locally
    const s = await createSession({ orgId: c.orgId, userId: c.userId, source: device ? "desktop" : "web", stt: device ? "local" : undefined, deviceId: c.deviceId, mode: b?.mode, title: b?.title, language: b?.language, crmEntryId: b?.crmEntryId, consentAttested: b?.consentAttested, participantsInformed: b?.participantsInformed === true })
    return NextResponse.json({ session: publicSession(s) }, { status: 201 })
  } catch (e) { return halyardFailure(e) }
}
/** The person's recent sessions in the active workspace. */
export async function GET() {
  try {
    const c = await halyardContext(false)
    const rows = (await sql`SELECT * FROM halyard_sessions WHERE org_id = ${c.orgId} AND user_id = ${c.userId} ORDER BY started_at DESC LIMIT 50`) as any[]
    return NextResponse.json({ sessions: rows.map(publicSession) })
  } catch (e) { return halyardFailure(e) }
}

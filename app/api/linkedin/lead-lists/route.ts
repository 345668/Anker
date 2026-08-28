/**
 * /api/linkedin/lead-lists — list + create lead lists (dashboard-facing).
 *   GET  → { ok, lists }        each with memberCount
 *   POST → { ok, list }         { name, source? }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { listLeadLists, createLeadList } from "@/lib/linkedin/lead-lists"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  return NextResponse.json({ ok: true, lists: await listLeadLists(auth.id) })
}

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const body = await req.json().catch(() => ({}))
  try {
    const list = await createLeadList(auth.id, body.name, body.source)
    return NextResponse.json({ ok: true, list })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to create list" }, { status: 400 })
  }
}

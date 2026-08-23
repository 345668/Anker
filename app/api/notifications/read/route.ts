/**
 * POST /api/notifications/read — mark the current user's notifications read.
 * Body: { id: string }  → one, or  { all: true }  → all unread.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { markRead } from "@/lib/notifications/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { id?: string; all?: boolean }
  if (!body.id && !body.all) return NextResponse.json({ error: "Provide id or all:true" }, { status: 400 })

  const updated = await markRead(user.id, { id: body.id, all: body.all })
  return NextResponse.json({ ok: true, updated })
}

/**
 *   GET    /api/anker/chats/[id]  → load a saved chat's messages
 *   DELETE /api/anker/chats/[id]  → delete a saved chat
 * Both scoped to the signed-in owner.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function uid() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await uid()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const { id } = await ctx.params
  const rows = await sql`SELECT id, title, model, messages FROM anker_chats WHERE id=${id} AND user_id=${user} LIMIT 1`
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const c = rows[0] as any
  return NextResponse.json({ id: c.id, title: c.title, model: c.model, messages: c.messages ?? [] })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await uid()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const { id } = await ctx.params
  await sql`DELETE FROM anker_chats WHERE id=${id} AND user_id=${user}`
  return NextResponse.json({ ok: true })
}

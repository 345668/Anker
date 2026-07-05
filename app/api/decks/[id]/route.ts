import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getDeck, updateDeck } from "@/lib/decks/decks"

export const runtime = "nodejs"

export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const deck = await getDeck(id, user.id)
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(deck)
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  await updateDeck(id, user.id, body)
  return NextResponse.json({ ok: true })
}

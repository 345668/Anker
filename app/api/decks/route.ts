import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createDeck, listDecks } from "@/lib/decks/decks"

export const runtime = "nodejs"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ decks: await listDecks(user.id) })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body.templateId) return NextResponse.json({ error: "templateId required" }, { status: 400 })
  const deck = await createDeck({
    ownerId: user.id, templateId: String(body.templateId),
    fundId: body.fundId ?? null, targetId: body.targetId ?? null,
  })
  if (!deck) return NextResponse.json({ error: "Deck create failed — did the migration run?" }, { status: 500 })
  return NextResponse.json(deck)
}

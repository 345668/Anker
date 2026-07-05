/**
 * PATCH /api/decks/templates/:id
 *   Update classification / flags on a template.
 *   Body: { deckType?, shortlisted?, favorite?, name?, notes? }
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { updateTemplate, DECK_TYPES, type DeckType } from "@/lib/decks/templates"

export const runtime = "nodejs"

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  let body: any = {}
  try { body = await req.json() } catch {}
  const patch: any = {}
  if (typeof body.deckType === "string" && DECK_TYPES.includes(body.deckType as DeckType)) patch.deckType = body.deckType
  if (typeof body.shortlisted === "boolean") patch.shortlisted = body.shortlisted
  if (typeof body.favorite    === "boolean") patch.favorite    = body.favorite
  if (typeof body.name  === "string") patch.name  = body.name.slice(0, 200)
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 2000)
  if (typeof body.thumbnailUrl === "string") patch.thumbnailUrl = body.thumbnailUrl.slice(0, 1000)
  try {
    await updateTemplate(id, patch, user.email || user.id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Update failed" }, { status: 500 })
  }
}

/**
 * POST /api/decks/:id/generate
 *   Server-side generation: Qwen produces narrative text for each
 *   "value" slot in the template's approved mapping. Result is stored
 *   on decks.ai_generated_fields so the plugin's next payload fetch
 *   includes them.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { getDeck, updateDeck } from "@/lib/decks/decks"
import { buildFundContext } from "@/lib/decks/context"
import { generate } from "@/lib/ai/provider"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const deck = await getDeck(id, user.id)
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!deck.fundId) return NextResponse.json({ error: "Deck has no fund" }, { status: 400 })

  const rows: any[] = await sql`SELECT deck_type, node_mapping FROM deck_templates WHERE id = ${deck.templateId}::uuid LIMIT 1`
  const t = rows[0]
  const entries: any[] = t?.node_mapping?.entries ?? []
  const valueSlots = entries.filter((e) => e.kind === "value")
  if (!valueSlots.length) {
    return NextResponse.json({ ok: true, generated: 0, note: "No narrative slots to fill." })
  }

  const context = await buildFundContext(deck.fundId)
  const generated: Record<string, string> = { ...(deck.aiGeneratedFields || {}) }
  let n = 0
  for (const slot of valueSlots) {
    const budget = slot.budget || 240
    const prompt = `You are writing one slide field of a ${t.deck_type} deck for a VC fund.

Fund context: ${JSON.stringify(context, null, 2)}
Field intent: ${slot.note || "narrative text for this slide slot"}
Original placeholder: ${JSON.stringify(slot.originalText || "")}

Write ONE piece of text, at most ${budget} characters. No markdown. No quotes. Plain prose.`
    try {
      const s = (await generate(prompt, { task: "ai_rationale", temperature: 0.5, maxTokens: 400 })).trim()
      generated[slot.nodeId] = s.slice(0, budget)
      n++
    } catch (e) { console.error("[decks generate]", slot.nodeId, e) }
  }
  await updateDeck(id, user.id, {
    aiGeneratedFields: generated,
    status: "filled",
    lastFilledAt: new Date().toISOString(),
  })
  return NextResponse.json({ ok: true, generated: n })
}

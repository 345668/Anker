import { NextRequest, NextResponse } from "next/server"
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth"
import { sql } from "@/lib/db"
import { getDeck } from "@/lib/decks/decks"
import { buildFundContext } from "@/lib/decks/context"
import { proposeMapping, type TextNode } from "@/lib/decks/ai-mapper"

export const runtime = "nodejs"
export const maxDuration = 60

export async function OPTIONS() { return corsOptionsResponse() }

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateExtension(req)
  if (!auth.ok) return auth.response
  const { id } = await ctx.params
  const deck = await getDeck(id, auth.userId)
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404, headers: corsHeaders() })

  const body: { nodes?: TextNode[]; approve?: boolean; mapping?: any } = await req.json().catch(() => ({}))

  // Approve path: persist the mapping to the template row so it becomes deterministic.
  if (body.approve && body.mapping) {
    await sql`
      UPDATE deck_templates SET
        node_mapping   = ${JSON.stringify({ entries: body.mapping })}::jsonb,
        mapping_ready  = true
       WHERE id = ${deck.templateId}::uuid`
    return NextResponse.json({ ok: true, saved: true }, { headers: corsHeaders() })
  }

  // Propose path: call the AI router against the fund context.
  if (!Array.isArray(body.nodes) || !body.nodes.length) {
    return NextResponse.json({ error: "nodes[] required" }, { status: 400, headers: corsHeaders() })
  }
  const context = deck.fundId ? await buildFundContext(deck.fundId) : null
  if (!context) {
    return NextResponse.json({ error: "Deck has no fund attached — set fundId on the deck first." }, { status: 400, headers: corsHeaders() })
  }
  const rows: any[] = await sql`SELECT deck_type FROM deck_templates WHERE id = ${deck.templateId}::uuid LIMIT 1`
  const deckType = rows[0]?.deck_type || "unclassified"
  const proposal = await proposeMapping({ nodes: body.nodes, context, deckType })
  return NextResponse.json(proposal, { headers: corsHeaders() })
}

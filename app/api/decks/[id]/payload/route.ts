/**
 * GET /api/decks/:id/payload
 *   Bearer-auth (extension_tokens). Returns the fill payload the Figma
 *   plugin applies: node_id -> string, plus deck meta.
 */
import { NextRequest, NextResponse } from "next/server"
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth"
import { sql } from "@/lib/db"
import { getDeck } from "@/lib/decks/decks"
import { buildFundContext } from "@/lib/decks/context"
import { resolveMappingValues } from "@/lib/decks/ai-mapper"

export const runtime = "nodejs"

export async function OPTIONS() { return corsOptionsResponse() }

export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateExtension(_ as any)
  if (!auth.ok) return auth.response
  const { id } = await ctx.params
  const deck = await getDeck(id, auth.userId)
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404, headers: corsHeaders() })

  // Load the template + its mapping.
  const rows: any[] = await sql`SELECT * FROM deck_templates WHERE id = ${deck.templateId}::uuid LIMIT 1`
  const template = rows[0]
  if (!template) return NextResponse.json({ error: "Template missing" }, { status: 404, headers: corsHeaders() })

  const context = deck.fundId ? await buildFundContext(deck.fundId) : null
  const mapping = Array.isArray(template.node_mapping?.entries) ? template.node_mapping.entries : []

  let fills: Record<string, string> = {}
  if (context && mapping.length) {
    fills = resolveMappingValues(mapping as any, context, {} as any)
  }
  // Overlay any user-edited values from the deck.
  for (const [k, v] of Object.entries(deck.values || {})) fills[k] = String(v)

  return NextResponse.json({
    deck: { id: deck.id, status: deck.status },
    template: { fileKey: template.file_key, mappingReady: !!template.mapping_ready },
    workspaceFileKey: deck.workspaceFileKey,
    fills, // { nodeId: string }
  }, { headers: corsHeaders() })
}

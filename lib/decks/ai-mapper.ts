/**
 * AI mapping — takes a list of Figma text nodes ({nodeId, characters,
 * slideIndex, boxWidth}) from the plugin + fund context, returns a
 * proposed mapping keyed by nodeId.
 *
 * A mapping entry is either:
 *   { field: "fund.name" }        — direct field reference
 *   { value: "…literal…" }        — AI-generated string
 *   { skip: true }                — leave as-is (decorative text)
 *
 * The prompt tells the AI provider to prefer field references for concrete facts and
 * only fall back to generated strings for narrative slides (thesis blurb,
 * team bio, etc.). Every result is char-budgeted against the original
 * node's characters length so we never overflow a slide.
 */
import { generateTyped } from "@/lib/ai/sdk-bridge"
import { z } from "zod"
import type { FundContext } from "./context"

export interface TextNode {
  nodeId: string
  slideIndex: number
  characters: string           // Current placeholder text
  role?: "title" | "body" | "footer" | "label" | "unknown"
}

const MappingEntry = z.object({
  nodeId: z.string(),
  kind: z.enum(["field", "value", "skip"]),
  field: z.string().optional(),
  value: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  note: z.string().optional(),
})

const MappingResponse = z.object({
  entries: z.array(MappingEntry),
})

export async function proposeMapping(args: {
  nodes: TextNode[]
  context: FundContext
  deckType: string
}): Promise<z.infer<typeof MappingResponse>> {
  const { nodes, context, deckType } = args
  const nodeList = nodes.map((n) => (
    `  { nodeId: "${n.nodeId}", slide: ${n.slideIndex}, ` +
    `chars: ${n.characters.length}, text: ${JSON.stringify(n.characters.slice(0, 200))} }`
  )).join("\n")

  const prompt = `You are wiring a Figma slide deck to real fund data for an Anker VC platform.

Deck type: ${deckType}
Fund context (JSON):
${JSON.stringify(context, null, 2)}

Below is every text node on the deck. For each, decide:
 - "field"  → the node maps to a known field on the fund context. Use a
              dotted path like "fund.name", "fund.tagline",
              "fund.management_fee", "portfolio[0].company", etc.
 - "value"  → generate a fresh string for narrative slots (thesis blurb,
              team bio, why-now line, etc.). Keep the string strictly ≤
              the original text's character count.
 - "skip"   → leave the text as-is. Use for decorative placeholders,
              page numbers, section labels that don't need to change.

Nodes:
${nodeList}

Return JSON matching the schema. For every node you receive, produce
exactly one entry. Prefer "field" over "value" whenever the fund context
has the data. Never propose a "value" longer than the original node's
chars. If unsure, use "skip".`

  const r = await generateTyped(MappingResponse, prompt, {
    task: "deep_research",
    temperature: 0.2,
    maxTokens: 4096,
  })
  if (!r.ok) return { entries: [] }
  // Enforce char budgets defensively (LLMs ignore instructions sometimes).
  const byId = new Map(nodes.map((n) => [n.nodeId, n]))
  const clean = r.value.entries.filter((e) => byId.has(e.nodeId)).map((e) => {
    const src = byId.get(e.nodeId)!
    if (e.kind === "value" && e.value && e.value.length > src.characters.length + 4) {
      return { ...e, value: e.value.slice(0, Math.max(1, src.characters.length)) }
    }
    return e
  })
  return { entries: clean }
}

/** Given an approved mapping + a fund context, resolve every entry to
 *  a final string. Field paths are dot-walked. Missing paths fall back
 *  to the current characters (i.e. leave unchanged). */
export function resolveMappingValues(
  mapping: Array<{ nodeId: string; kind: "field" | "value" | "skip"; field?: string; value?: string }>,
  context: FundContext,
  nodesById: Record<string, TextNode>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of mapping) {
    if (e.kind === "skip") continue
    if (e.kind === "value" && e.value != null) { out[e.nodeId] = e.value; continue }
    if (e.kind === "field" && e.field) {
      const v = pluck(context as any, e.field)
      if (v != null) out[e.nodeId] = String(v)
    }
  }
  return out
}

function pluck(obj: any, path: string): any {
  // Supports `foo.bar`, `foo[0].bar`, `arr[3]`.
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)
  let cur = obj
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p as any]
  }
  return cur
}

/**
 * POST /api/admin/newsroom/draft
 *   Body: { topic: string, blogType?: string, lengthHint?: "short"|"medium"|"long",
 *           voice?: string, audienceHint?: string }
 *
 * Returns: { headline, subheadline, content, suggestedTags }
 *
 * Uses the local-AI deep tier (deck_critique → qwen2.5:14b-instruct
 * by default).  Output is plain Markdown the editor can drop into the
 * "content" field.  Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { generate } from "@/lib/ai/provider"

export const runtime = "nodejs"
export const maxDuration = 240

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const body = await req.json()
    const topic = String(body?.topic ?? "").trim()
    if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 })

    const blogType = String(body?.blogType ?? "Insights")
    const length = String(body?.lengthHint ?? "medium")
    const voice = String(body?.voice ?? "concise, founder-friendly, evidence-led")
    const audience = String(body?.audienceHint ?? "founders raising and LPs evaluating funds")

    const targetWords =
      length === "short" ? 350 :
      length === "long"  ? 1100 : 700

    const prompt = `You are the editor of an investment-tech newsroom called Anker.  Draft a ${blogType.toLowerCase()} article on the topic below.

Topic: ${topic}

Constraints
- Voice: ${voice}.  Avoid hype.  Concrete examples > abstract claims.
- Audience: ${audience}.
- Length: ~${targetWords} words.
- Format: Markdown. Use H2 (##) for major sections, H3 (###) for sub-sections.
  IMPORTANT spacing rules — the renderer relies on these:
    * Insert ONE BLANK LINE before every heading
    * Insert ONE BLANK LINE before every paragraph (so paragraphs are separated by \n\n, not \n)
    * Insert ONE BLANK LINE before every bullet list and numbered list
    * Use \n inside the JSON string to encode each line break (e.g. "## Section\n\nFirst paragraph...\n\n- bullet one\n- bullet two\n\n## Next section")
  Use short paragraphs (2-4 sentences). Use bullet lists where they earn their keep.
  No em dashes (use commas, colons, periods, or arrows).
- Open with a 1-2 sentence hook that promises the value of reading further.
- Close with a single sentence "what to do next".

Return ONLY this strict JSON object — no prose, no fences:

{
  "headline": "<strong, specific headline, <=80 chars>",
  "subheadline": "<one sentence, <=140 chars>",
  "content": "<full Markdown article body, no front-matter>",
  "suggestedTags": ["<3-6 lowercase tags>"]
}`

    const raw = await generate(prompt, {
      task: "deck_critique",                     // routes to deep tier
      maxTokens: targetWords * 2 + 600,
      temperature: 0.45,
      json: true,
    })
    const parsed = parseJson(raw)
    if (!parsed?.content || !parsed?.headline) {
      return NextResponse.json({
        error: "AI draft failed — model returned no usable content. Try again or use a different blogType.",
        raw: raw?.slice(0, 400) ?? "",
      }, { status: 502 })
    }
    return NextResponse.json({
      headline: String(parsed.headline ?? "").slice(0, 200),
      subheadline: typeof parsed.subheadline === "string" ? parsed.subheadline.slice(0, 240) : null,
      content: String(parsed.content ?? "").trim(),
      suggestedTags: Array.isArray(parsed.suggestedTags)
        ? parsed.suggestedTags.filter((s: any) => typeof s === "string").slice(0, 8)
        : [],
    })
  } catch (e: any) {
    console.error("[admin/newsroom/draft]", e)
    return NextResponse.json({ error: e?.message ?? "Draft failed" }, { status: 500 })
  }
}

function parseJson(raw: string): any | null {
  if (!raw) return null
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  try { return JSON.parse(cleaned) } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) } catch {}
  }
  return null
}

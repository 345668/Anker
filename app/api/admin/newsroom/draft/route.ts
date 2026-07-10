/**
 * POST /api/admin/newsroom/draft
 *   Body: {
 *     topic: string,
 *     blogType?: string,
 *     lengthHint?: "short" | "medium" | "long" | "feature",
 *     voice?: string,
 *     audienceHint?: string,
 *     themeId?: string,            // ground in a news_themes lens (keywords steer retrieval + angle)
 *     sourceItemIds?: string[],    // explicit news_source_items to ground in
 *     groundFromNews?: boolean,    // auto-retrieve matching source items for grounding
 *   }
 *
 * Returns: { headline, subheadline, content, suggestedTags, sources,
 *            usedSourceItemIds, theme }
 *
 * Grounding: when source items are supplied (or auto-retrieved via the
 * topic + theme keywords), their headlines/summaries are injected as a
 * SOURCES block. The model must build the piece on those facts and close
 * with a "## Sources" section of markdown links; the endpoint returns the
 * structured sources too so the editor can persist news_articles.sources
 * and source_item_ids on save.
 *
 * Length tiers (was 350/700/1100): short ~500, medium ~1000, long ~1800,
 * feature ~3000 words with an essay structure. Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { generate } from "@/lib/ai/provider"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const maxDuration = 300

interface SourceItem {
  id: string
  headline: string
  summary: string | null
  content: string | null
  source_url: string | null
  published_at: string | null
}

const LENGTHS: Record<string, { words: number; structure: string }> = {
  short: {
    words: 500,
    structure: "A tight brief: hook, 2-3 sections, close.",
  },
  medium: {
    words: 1000,
    structure: "A standard piece: hook, 4-5 H2 sections, close.",
  },
  long: {
    words: 1800,
    structure:
      "A long-read: hook, 5-7 H2 sections with H3 sub-sections where useful, one worked example or mini case study, close.",
  },
  feature: {
    words: 3000,
    structure:
      "A feature essay: a scene-setting opening, a clear thesis, 6-9 H2 sections that build the argument (context → evidence → implications), at least two concrete case studies or worked numbers, a counter-argument section, and a strong close. Do NOT pad — every section must earn its length.",
  },
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const body = await req.json()
    const topic = String(body?.topic ?? "").trim()
    if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 })

    const blogType = String(body?.blogType ?? "Insights")
    const lengthKey = LENGTHS[String(body?.lengthHint ?? "medium")] ? String(body?.lengthHint ?? "medium") : "medium"
    const { words: targetWords, structure } = LENGTHS[lengthKey]
    const voice = String(body?.voice ?? "concise, founder-friendly, evidence-led")
    const audience = String(body?.audienceHint ?? "founders raising and LPs evaluating funds")

    // ── Thematic lens ────────────────────────────────────────────────
    let theme: { id: string; name: string; description: string | null; keywords: string[] } | null = null
    if (body?.themeId) {
      const rows = await sql`
        select id, name, description, keywords from news_themes
        where id = ${String(body.themeId)}::uuid and enabled = true limit 1
      ` as any[]
      if (rows[0]) theme = { ...rows[0], keywords: Array.isArray(rows[0].keywords) ? rows[0].keywords : [] }
    }

    // ── Grounding: explicit source items, else auto-retrieval ────────
    let items: SourceItem[] = []
    const explicitIds: string[] = Array.isArray(body?.sourceItemIds)
      ? body.sourceItemIds.map(String).slice(0, 12)
      : []
    if (explicitIds.length) {
      items = await sql`
        select id, headline, summary, content, source_url, published_at
        from news_source_items where id = any(${explicitIds}::uuid[])
        limit 12
      ` as SourceItem[]
    } else if (body?.groundFromNews === true || theme) {
      // Auto-retrieve: recent items matching topic words or theme keywords,
      // best relevance first.
      const needles = [
        ...topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 6),
        ...(theme?.keywords ?? []).map((k) => k.toLowerCase()),
      ].slice(0, 12)
      if (needles.length) {
        const pattern = "%(" + needles.map((n) => n.replace(/([%_|()\\])/g, "\\$1")).join("|") + ")%"
        items = await sql`
          select id, headline, summary, content, source_url, published_at
          from news_source_items
          where published_at > now() - interval '45 days'
            and (lower(headline) similar to ${pattern} or lower(coalesce(summary, '')) similar to ${pattern})
          order by relevance_score desc nulls last, published_at desc
          limit 8
        ` as SourceItem[]
      }
    }

    const sourcesBlock = items.length
      ? `\n\nSOURCES — ground the article in these reported items. Use their concrete facts, figures and names; attribute claims to them; do not invent beyond them. Close the article with a "## Sources" section listing each used source as a Markdown link.\n` +
        items.map((s, i) =>
          `[S${i + 1}] ${s.headline}${s.published_at ? ` (${String(s.published_at).slice(0, 10)})` : ""}` +
          `${s.source_url ? ` — ${s.source_url}` : ""}\n${(s.summary || s.content || "").replace(/\s+/g, " ").slice(0, 600)}`,
        ).join("\n\n")
      : ""

    const themeBlock = theme
      ? `\n\nTHEMATIC LENS: "${theme.name}"${theme.description ? ` — ${theme.description}` : ""}. Angle the piece through this lens; weave in these threads where they genuinely fit: ${theme.keywords.join(", ")}.`
      : ""

    const prompt = `You are the editor of an investment-tech newsroom called Anker.  Draft a ${blogType.toLowerCase()} article on the topic below.

Topic: ${topic}${themeBlock}${sourcesBlock}

Constraints
- Voice: ${voice}.  Avoid hype.  Concrete examples > abstract claims.
- Audience: ${audience}.
- Length: ~${targetWords} words. ${structure}
- Format: Markdown. Use H2 (##) for major sections, H3 (###) for sub-sections.
  IMPORTANT spacing rules — the renderer relies on these:
    * Insert ONE BLANK LINE before every heading
    * Insert ONE BLANK LINE before every paragraph (so paragraphs are separated by \\n\\n, not \\n)
    * Insert ONE BLANK LINE before every bullet list and numbered list
    * Use \\n inside the JSON string to encode each line break
  Use short paragraphs (2-4 sentences). Use bullet lists where they earn their keep.
  No em dashes (use commas, colons, periods, or arrows).
- Open with a 1-2 sentence hook that promises the value of reading further.
- Close with a single sentence "what to do next"${items.length ? ' followed by the "## Sources" section' : ""}.

Return ONLY this strict JSON object — no prose, no fences:

{
  "headline": "<strong, specific headline, <=80 chars>",
  "subheadline": "<one sentence, <=140 chars>",
  "content": "<full Markdown article body, no front-matter>",
  "suggestedTags": ["<3-6 lowercase tags>"]
}`

    const raw = await generate(prompt, {
      task: "deck_critique",                     // routes to deep tier
      maxTokens: Math.min(Math.round(targetWords * 2.2) + 800, 9000),
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
      // Structured grounding for the editor to persist on save
      // (news_articles.sources + source_item_ids).
      sources: items.map((s) => ({ name: s.headline, url: s.source_url })),
      usedSourceItemIds: items.map((s) => s.id),
      theme: theme ? { id: theme.id, name: theme.name } : null,
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

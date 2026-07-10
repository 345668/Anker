/**
 * POST /api/decks/templates/classify-ai — bulk-classify unclassified templates.
 *
 * 132 seeded community templates arrived unclassified; classifying by hand
 * is drudgery the model can do from names alone. One AI call classifies up
 * to 40 template names into the deck-type vocabulary; obvious calls stick,
 * uncertain ones stay unclassified for human review.
 *
 * Idempotent — run repeatedly until `remaining` hits 0. Admin/user-gated.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { generate } from "@/lib/ai/provider"

export const runtime = "nodejs"
export const maxDuration = 120

const TYPES = ["fund_overview", "lp_update", "pitch_deck", "investment_memo", "portfolio_review", "other"] as const

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rows = await sql`
    select id, name, file_key from deck_templates
    where deck_type = 'unclassified'
    order by shortlisted desc, favorite desc, created_at asc
    limit 40
  ` as Array<{ id: string; name: string | null; file_key: string }>
  if (!rows.length) return NextResponse.json({ ok: true, classified: 0, remaining: 0 })

  const list = rows.map((r, i) => `${i + 1}. ${r.name || r.file_key}`).join("\n")
  const prompt = `Classify each Figma deck template into EXACTLY one type from this vocabulary:
${TYPES.join(" | ")}

Guidance: investor pitch/startup fundraising decks -> pitch_deck; fund marketing /
"fund one-pager" / GP fundraise decks -> fund_overview; quarterly/annual investor
letters -> lp_update; single-deal IC memos -> investment_memo; portfolio KPI
reviews -> portfolio_review; anything that is clearly none of these (resume,
agency, generic business template) -> other. If genuinely ambiguous, answer "skip".

Templates:
${list}

Return ONLY strict JSON: {"classifications": ["<type-or-skip per line, in order>"]}`

  const raw = await generate(prompt, { task: "ai_rationale", temperature: 0.1, maxTokens: 1200, json: true })
  let parsed: any = null
  try { parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()) } catch {
    const m = raw?.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]) } catch {} }
  }
  const answers: string[] = Array.isArray(parsed?.classifications) ? parsed.classifications.map(String) : []
  if (!answers.length) return NextResponse.json({ error: "AI classification failed — try again." }, { status: 502 })

  let classified = 0
  const byType: Record<string, number> = {}
  for (let i = 0; i < rows.length && i < answers.length; i++) {
    const t = answers[i].trim().toLowerCase()
    if (!(TYPES as readonly string[]).includes(t)) continue
    await sql`
      update deck_templates set deck_type = ${t}, classified_at = now(), classified_by = ${"ai:" + user.id}
      where id = ${rows[i].id}::uuid and deck_type = 'unclassified'
    `
    classified++
    byType[t] = (byType[t] ?? 0) + 1
  }
  const remain = await sql`select count(*)::int as n from deck_templates where deck_type = 'unclassified'` as Array<{ n: number }>
  return NextResponse.json({ ok: true, classified, byType, remaining: remain[0]?.n ?? 0 })
}

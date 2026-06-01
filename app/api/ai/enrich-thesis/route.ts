/**
 * POST /api/ai/enrich-thesis
 * Body: {
 *   kind?: "deck" | "fund"      // shapes the prompt slightly
 *   thesis?: string             // one-liner / fund thesis statement
 *   sectors?: string[]          // currently entered sectors
 *   stage?: string              // round stage / fund stage
 *   hq?: string                 // founder / fund HQ
 *   provider?: AiProvider       // per-run override
 * }
 *
 * Returns: {
 *   sectors:  string[]   // 4-8 *additional* adjacent sectors worth adding
 *   anchors:  string[]   // 3-6 LP / investor archetypes that would back this
 *   rewrites: string[]   // 2 tightened versions of the user's thesis
 *   provider: string
 *   aiError:  string | null
 * }
 *
 * User-gated. Read-only — the UI lets the founder accept / reject each
 * addition before mutating the editor.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateDetailed, type AiProvider } from "@/lib/ai/provider"
import { PROVIDER_NAMES } from "@/lib/ai/runtime-config"

export const runtime = "nodejs"
export const maxDuration = 90

function extractJson(text: string): any | null {
  if (!text) return null
  const start = text.indexOf("{")
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)) } catch { return null } }
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const kind = body?.kind === "fund" ? "fund" : "deck"
    const thesis = String(body?.thesis ?? "").trim()
    const sectors: string[] = Array.isArray(body?.sectors)
      ? body.sectors.map((x: any) => String(x ?? "").trim()).filter(Boolean).slice(0, 30)
      : []
    const stage = String(body?.stage ?? "").trim()
    const hq = String(body?.hq ?? "").trim()
    const provider =
      body?.provider && PROVIDER_NAMES.includes(body.provider) && body.provider !== "none"
        ? (body.provider as AiProvider)
        : undefined

    if (!thesis && sectors.length === 0) {
      return NextResponse.json(
        { error: "Provide a thesis or at least one sector to enrich." },
        { status: 400 },
      )
    }

    const prompt = kind === "fund"
      ? `You are an LP-side analyst helping a fund GP tighten their thesis before
running an LP matchmaking pass.  Suggest sector adjacencies that strong
LPs already buy alongside the listed ones; suggest LP archetypes that
typically back this kind of fund; and tighten the thesis in two variants.

Return ONLY a JSON object, no prose:
{
  "sectors":  [4-8 short adjacent sectors NOT already in the list],
  "anchors":  [3-6 LP archetype names — e.g. "endowment with climate
               sleeve", "family office (former operator)", "FoF emerging
               managers"],
  "rewrites": [two tightened one-line versions of the thesis]
}

THESIS: ${thesis || "(not provided)"}
SECTORS: ${sectors.join(", ") || "(none)"}
STAGE: ${stage || "(not provided)"}
HQ: ${hq || "(not provided)"}`
      : `You are a fundraising analyst helping a founder broaden their investor
pipeline.  Suggest sector adjacencies investors who back the listed
sectors also fund; suggest the strongest investor archetypes for this
stage / thesis; and tighten the one-liner into two variants.

Return ONLY a JSON object, no prose:
{
  "sectors":  [4-8 short adjacent sectors NOT already in the list],
  "anchors":  [3-6 investor archetype names — e.g. "early-stage climate
               VC", "infra-focused growth", "operator-LP family office"],
  "rewrites": [two tightened one-line versions of the founder's pitch]
}

ONE-LINER: ${thesis || "(not provided)"}
SECTORS: ${sectors.join(", ") || "(none)"}
STAGE: ${stage || "(not provided)"}
HQ: ${hq || "(not provided)"}`

    const ai = await generateDetailed(prompt, {
      task: "match_summary",
      maxTokens: 500,
      temperature: 0.4,
      provider,
    })

    const parsed = extractJson(ai.text) ?? {}
    const outSectors = Array.isArray(parsed.sectors)
      ? parsed.sectors.map((s: any) => String(s ?? "").trim()).filter(Boolean).slice(0, 10)
      : []
    const outAnchors = Array.isArray(parsed.anchors)
      ? parsed.anchors.map((s: any) => String(s ?? "").trim()).filter(Boolean).slice(0, 8)
      : []
    const outRewrites = Array.isArray(parsed.rewrites)
      ? parsed.rewrites.map((s: any) => String(s ?? "").trim()).filter(Boolean).slice(0, 3)
      : []

    // De-dupe sectors against the input.
    const existing = new Set(sectors.map((s) => s.toLowerCase()))
    const dedupedSectors = outSectors.filter((s: string) => !existing.has(s.toLowerCase()))

    return NextResponse.json({
      sectors: dedupedSectors,
      anchors: outAnchors,
      rewrites: outRewrites,
      provider: ai.provider,
      aiError: ai.text ? null : ai.error,
    })
  } catch (e: any) {
    console.error("[ai/enrich-thesis] error:", e)
    return NextResponse.json({ error: e?.message ?? "enrich-thesis failed" }, { status: 500 })
  }
}

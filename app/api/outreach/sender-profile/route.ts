/**
 * GET  /api/outreach/sender-profile   — list the user's saved sender profiles.
 * POST /api/outreach/sender-profile   — build + persist a sender profile.
 *
 * A "sender profile" describes the founder doing the outreach.  It is
 * built from two inputs:
 *   1. the founder context "profile set" (company, one-liner, facts…)
 *   2. an additional pasted professional summary of the sender
 * The AI fuses these into a concise, credible sender bio that the
 * draft-email step uses so every message sounds like the same person.
 *
 * Body (POST):
 *   { id?, name, summary, founder, makeDefault?, rebuild? }
 *   - id present       → update that profile
 *   - rebuild !== false → (re)generate built_profile via AI
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { generateDetailed } from "@/lib/ai/provider"

export const runtime = "nodejs"
export const maxDuration = 120

function serialize(p: any) {
  return {
    id: p.id,
    name: p.name,
    rawSummary: p.raw_summary ?? "",
    profileSet: p.profile_set ?? null,
    builtProfile: p.built_profile ?? "",
    generatedBy: p.generated_by ?? null,
    isDefault: !!p.is_default,
    createdAt: p.created_at ? new Date(p.created_at).toISOString() : null,
    updatedAt: p.updated_at ? new Date(p.updated_at).toISOString() : null,
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const rows = await sql`
      SELECT * FROM sender_profiles
      WHERE user_id = ${user.id}
      ORDER BY is_default DESC, updated_at DESC
    `
    return NextResponse.json({ profiles: (rows as any[]).map(serialize) })
  } catch (e: any) {
    console.error("[outreach/sender-profile GET] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to load sender profiles" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const id = body?.id ? String(body.id) : null
    const name = String(body?.name ?? "").trim() || "My profile"
    const rawSummary = String(body?.summary ?? "").trim()
    const founder = body?.founder ?? {}
    const makeDefault = !!body?.makeDefault
    const rebuild = body?.rebuild !== false

    // Compose the source material for the AI.
    const profileSetText = [
      founder?.founderName && `Founder: ${founder.founderName}`,
      founder?.companyName && `Company: ${founder.companyName}`,
      founder?.oneLiner && `One-liner: ${founder.oneLiner}`,
      Array.isArray(founder?.facts) && founder.facts.length
        ? `Traction / facts:\n- ${founder.facts.join("\n- ")}`
        : null,
      founder?.calendarUrl && `Calendar: ${founder.calendarUrl}`,
    ].filter(Boolean).join("\n")

    let builtProfile = ""
    let generatedBy = "heuristic"

    if (rebuild && (rawSummary || profileSetText)) {
      const prompt = `You are helping a founder craft a reusable "about me" used to personalize fundraising outreach. Fuse the two inputs below into a credible, specific sender profile the founder can stand behind.

Return PLAIN TEXT with exactly these two parts:
BIO: one tight paragraph (45-70 words), first person, no hype, concrete.
CREDIBILITY: 3 short bullet-free lines separated by " | " naming the strongest, most specific proof points (numbers, names, prior exits, domain depth).

PROFILE SET (structured context):
${profileSetText || "(none provided)"}

PASTED PROFESSIONAL SUMMARY (the founder's own words):
${rawSummary || "(none provided)"}`

      const ai = await generateDetailed(prompt, { task: "investor_profile", maxTokens: 320, temperature: 0.5 })
      if (ai.text) {
        builtProfile = ai.text.trim()
        generatedBy = ai.provider
      } else {
        builtProfile = [
          rawSummary,
          profileSetText && `\n\n${profileSetText}`,
        ].filter(Boolean).join("").trim() || "(add a professional summary and your founder context, then rebuild)"
        generatedBy = "heuristic"
      }
    }

    const profileSetJson = JSON.stringify(founder ?? {})

    let saved: any
    if (id) {
      const [row] = await sql`
        UPDATE sender_profiles SET
          name          = ${name},
          raw_summary   = ${rawSummary},
          profile_set   = ${profileSetJson}::jsonb,
          built_profile = COALESCE(${rebuild ? builtProfile : null}, built_profile),
          generated_by  = COALESCE(${rebuild ? generatedBy : null}, generated_by),
          updated_at    = NOW()
        WHERE id = ${id} AND user_id = ${user.id}
        RETURNING *
      `
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })
      saved = row
    } else {
      // First profile becomes default unless caller says otherwise.
      const [{ n } = { n: 0 }] = await sql`
        SELECT COUNT(*)::int AS n FROM sender_profiles WHERE user_id = ${user.id}
      ` as any[]
      const isDefault = makeDefault || Number(n) === 0
      const [row] = await sql`
        INSERT INTO sender_profiles (
          user_id, name, raw_summary, profile_set, built_profile, generated_by, is_default, created_at, updated_at
        ) VALUES (
          ${user.id}, ${name}, ${rawSummary}, ${profileSetJson}::jsonb, ${builtProfile}, ${generatedBy}, ${isDefault}, NOW(), NOW()
        )
        RETURNING *
      `
      saved = row
    }

    // Enforce a single default per user when requested.
    if (makeDefault && saved?.id) {
      await sql`
        UPDATE sender_profiles SET is_default = (id = ${saved.id})
        WHERE user_id = ${user.id}
      `
      saved.is_default = true
    }

    return NextResponse.json({ profile: serialize(saved) }, { status: id ? 200 : 201 })
  } catch (e: any) {
    console.error("[outreach/sender-profile POST] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to save sender profile" }, { status: 500 })
  }
}

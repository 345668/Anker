/**
 * POST /api/outreach/campaigns/[id]/enrich
 *
 * Batched profile enrichment for the campaign builder. Runs ONE batch per
 * call (default 15 members) so long batches don't blow the Vercel timeout.
 * The client polls this endpoint until nextOffset === null.
 *
 * Body:
 *   { batchSize?: 15, offset?: 0 }
 *
 * Returns:
 *   { ok, processed, remaining, nextOffset|null }
 *
 * The enrichment prompt takes the campaign's event_topic + a JSON array
 * of contact seeds and returns one enrichment record per contact.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { generateTyped } from "@/lib/ai/sdk-bridge"
import { z } from "zod"

export const runtime = "nodejs"
export const maxDuration = 120

const EnrichedProfile = z.object({
  index: z.number().int(),   // matches the input index we sent
  sectors: z.string(),       // comma-separated
  why_this_contact: z.string(),
  firm_intelligence: z.string(),
  investment_mandate: z.string(),
  personalisation_hook: z.string(),
  enriched_subject: z.string(),
})

const EnrichmentBatch = z.object({
  profiles: z.array(EnrichedProfile),
})

function buildSeed(m: any, idx: number) {
  const snap = (m.snapshot || {}) as Record<string, unknown>
  const ld = (m.linkedin_data || {}) as Record<string, unknown>
  return {
    index: idx,
    name: m.display_name,
    title: m.display_title || snap.title || ld.title || null,
    firm: snap.firm || ld.company || null,
    lp_type: m.lp_type,
    location: m.display_location || snap.location || null,
    linkedin_url: m.display_linkedin || snap.linkedin_url || null,
    headline: ld.headline || snap.headline || null,
    tags: snap.tags || null,
    email_domain: (m.email || "").split("@")[1] || null,
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const camp = await sql<any[]>`
    SELECT id, name, event_topic, event_date, event_url
    FROM outreach_campaigns
    WHERE id = ${campaignId} AND user_id = ${user.id}
  `
  if (!camp.length) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const batchSize = Math.max(1, Math.min(30, Number(body.batchSize ?? 15)))

  // Pick the next unenriched batch (selected + not yet done).
  const members = await sql<any[]>`
    SELECT m.id AS member_id, m.snapshot, m.email, m.lp_type,
           c.display_name, c.display_title, c.display_linkedin, c.display_location,
           c.linkedin_data
    FROM outreach_campaign_members m
    JOIN crm_entries c ON c.id = m.crm_entry_id
    WHERE m.campaign_id = ${campaignId} AND m.user_id = ${user.id}
      AND m.selected = true
      AND (m.enrichment_status IS NULL OR m.enrichment_status = 'failed')
    ORDER BY m.score DESC NULLS LAST, m.id
    LIMIT ${batchSize}
  `
  if (!members.length) {
    return NextResponse.json({ ok: true, processed: 0, remaining: 0, nextOffset: null })
  }

  const seeds = members.map((m, i) => buildSeed(m, i))
  const eventCtx = [
    camp[0].event_topic ? `Topic: ${camp[0].event_topic}` : null,
    camp[0].event_date ? `Date: ${camp[0].event_date}` : null,
    camp[0].event_url ? `RSVP URL: ${camp[0].event_url}` : null,
  ].filter(Boolean).join(" · ")

  const prompt = `
You are enriching a batch of ${seeds.length} LP / family-office / angel contact profiles
for a targeted outreach campaign.

Campaign: ${camp[0].name}${eventCtx ? " (" + eventCtx + ")" : ""}

For each input profile, return an enrichment record with:
  sectors              — comma-separated sectors this contact / firm invests in (based on what's plausible from the name, title, firm, headline)
  why_this_contact     — one-sentence rationale for reaching out for THIS campaign
  firm_intelligence    — 1-2 sentence summary of the firm (AUM if plausible, geography, thesis)
  investment_mandate   — one-liner on what they invest in (stage, check size, sector)
  personalisation_hook — one specific sentence to open the email — must reference something concrete about them
  enriched_subject     — customized subject line for the outreach email (max 60 chars)

Rules:
  - Never fabricate specific facts (AUM numbers, portfolio names). If you don't know, keep it directional.
  - Keep sectors comma-separated, no bullets.
  - Keep personalisation_hook conversational, not corporate.
  - Every field must be non-empty. Use "unknown — needs manual research" if genuinely blank.

Input profiles (JSON):
${JSON.stringify(seeds, null, 2)}

Return ONLY the enrichment records, one per input profile, in the same index order.
`.trim()

  const result = await generateTyped(EnrichmentBatch, prompt, {
    task: "ai_rationale",
    maxTokens: 4096,
  })

  if (!result.ok || !Array.isArray(result.value.profiles)) {
    return NextResponse.json(
      { error: "AI returned no enrichment", raw: result.ok ? undefined : result.error },
      { status: 500 },
    )
  }

  const byIndex = new Map<number, z.infer<typeof EnrichedProfile>>()
  for (const p of result.value.profiles) byIndex.set(p.index, p)

  let processed = 0
  for (let i = 0; i < members.length; i++) {
    const m = members[i]
    const p = byIndex.get(i)
    if (!p) {
      await sql`UPDATE outreach_campaign_members SET enrichment_status = 'failed' WHERE id = ${m.member_id}`
      continue
    }
    await sql`
      UPDATE outreach_campaign_members
      SET sectors              = ${p.sectors},
          why_this_contact     = ${p.why_this_contact},
          firm_intelligence    = ${p.firm_intelligence},
          investment_mandate   = ${p.investment_mandate},
          personalisation_hook = ${p.personalisation_hook},
          enriched_subject     = ${p.enriched_subject},
          enrichment_status    = 'done',
          enriched_at          = NOW()
      WHERE id = ${m.member_id}
    `
    processed++
  }

  const remainingRows = await sql<any[]>`
    SELECT count(*) AS n
    FROM outreach_campaign_members
    WHERE campaign_id = ${campaignId}
      AND selected = true
      AND (enrichment_status IS NULL OR enrichment_status = 'failed')
  `
  const remaining = Number(remainingRows[0]?.n ?? 0)

  return NextResponse.json({
    ok: true,
    processed,
    remaining,
    nextOffset: remaining > 0 ? 0 : null,
  })
}

/**
 * POST /api/outreach/lp-campaign
 *
 * Streaming SSE endpoint that runs the 4-step LP outreach pipeline.
 * The UI opens an EventSource (or reads a fetch stream) and receives
 * newline-delimited JSON events:
 *
 *   { type: "progress",  step: "enrich"|"draft", done: n, total: n, name: string }
 *   { type: "batch",     batchNum: n, batchTotal: n }
 *   { type: "result",    data: PipelineResult }
 *   { type: "error",     message: string }
 *
 * Request body (JSON):
 * {
 *   profiles: InvestorProfile[]   // parsed by the client from uploaded file
 *   limit?:   number              // optional cap
 * }
 *
 * Auth: checks Supabase session cookie — unauthenticated requests get 401.
 *
 * GET  /api/outreach/lp-campaign  — health check + sender brief
 * POST /api/outreach/lp-campaign  — run pipeline (streaming)
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import Anthropic from "@anthropic-ai/sdk"
import type { InvestorProfile, EnrichedProfile, DraftedEmail, PipelineResult } from "@/lib/outreach/types"
import { SVS_SENDER_BRIEF } from "@/lib/outreach/outreachPipeline"

export const maxDuration = 300 // 5 min

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sse(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function findPriorFirmContact(profile: InvestorProfile, all: InvestorProfile[]): string {
  const myDomain = domainFrom(profile.inferredWebsite || profile.linkedin)
  return all.find((p) => {
    if (p.id >= profile.id) return false
    const d = domainFrom(p.inferredWebsite || p.linkedin)
    return myDomain && d && myDomain === d
  })?.name ?? ""
}

function domainFrom(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, "").toLowerCase()
  } catch { return "" }
}

function getTone(lpType: string) {
  const map: Record<string, { tone: string; open: string; cta: string; channel: string; dmMax: number }> = {
    "Angel Investor":        { tone: "warm, peer-to-peer, operator-to-operator. First name.", open: "Hi {first},", cta: "Open to a 20-minute call? No ask attached.", channel: "linkedin", dmMax: 300 },
    "Angel Investor / HNW":  { tone: "warm, peer-to-peer. First name.", open: "Hi {first},", cta: "Open to a 20-minute call? No ask attached.", channel: "linkedin", dmMax: 300 },
    "Angel":                 { tone: "warm, peer-to-peer. First name.", open: "Hi {first},", cta: "Open to a 20-minute call? No ask attached.", channel: "linkedin", dmMax: 300 },
    "Family Office":         { tone: "quiet credibility-first, understated, relationship-oriented.", open: "Dear {first},", cta: "Happy to share a Fund II summary first, or jump on a brief call.", channel: "email", dmMax: 280 },
    "Endowment":             { tone: "long-horizon, institutional, mission-consistent. Formal.", open: "Dear {first},", cta: "I'd welcome the chance to share more — a brief call or a Fund II summary.", channel: "email", dmMax: 280 },
    "Institutional":         { tone: "formal, data-driven, strategy-aligned.", open: "Dear {first},", cta: "Happy to share a Fund II deck or schedule a brief introductory call.", channel: "email", dmMax: 260 },
    "Fund of Funds":         { tone: "institutional, returns-focused.", open: "Dear {first},", cta: "Happy to send a tear sheet or schedule an LP due-diligence call.", channel: "email", dmMax: 260 },
    "Sovereign Wealth Fund": { tone: "diplomatic, co-investment-forward, long-horizon.", open: "Dear {first},", cta: "I would welcome the opportunity to share materials or speak briefly.", channel: "email", dmMax: 260 },
    "Corporate VC":          { tone: "strategic-synergy-first, deal-flow-focused.", open: "Dear {first},", cta: "Happy to set up a strategy call or share portfolio overviews.", channel: "email", dmMax: 270 },
  }
  return map[lpType] ?? map["Institutional"]!
}

// ─── Single-profile enrich + draft ───────────────────────────────────────────

async function enrichAndDraft(
  profile: InvestorProfile,
  priorContact: string,
  batchNum: number,
  client: Anthropic
): Promise<{ enriched: EnrichedProfile; draft: DraftedEmail }> {
  const tone = getTone(profile.lpType)
  const brief = SVS_SENDER_BRIEF
  const firstName = profile.name.split(/\s+/)[0] ?? profile.name

  const systemPrompt = `You are a senior LP research analyst preparing personalised outreach for ${brief.fundName}.
VOICE RULES: ${brief.voicePrinciples.join(" | ")}
No em-dashes. No hype. One clear ask: 20-30 min call.
Respond in valid JSON only.`

  const userPrompt = `Enrich and draft outreach for this LP.

PROFILE:
#${profile.id} | ${profile.name} | ${profile.titleRole}
LP Type: ${profile.lpType} | Score: ${profile.score} | Location: ${profile.location}
Sectors: ${profile.sectors}
Website: ${profile.inferredWebsite}
Crawled focus: ${profile.investmentFocusExtracted || "(none)"}
Meta: ${(profile.metaDescription || "").slice(0, 180)}
Why selected: ${profile.whyThisContact || "(none)"}
${priorContact ? `Multi-touch: prior contact at this firm is ${priorContact}` : ""}

SENDER: ${brief.senderName}, ${brief.senderRole} | ${brief.senderLinkedIn}
FUND: ${brief.fundName} (${brief.fundURL}) — ${brief.fundHQ} — Target ${brief.fundTarget}
THESIS: ${brief.thesis}
DIFFERENTIATORS: ${brief.differentiators.join(" | ")}
LP QUOTE: ${brief.lpQuote}

TONE: ${tone.tone}
CTA: ${tone.cta}
SUBJECT STYLE: ≤9 words, no exclamation marks, matches tone

Return JSON with EXACTLY these keys:
{
  "firmIntelligence": "2-3 sentence firm/person brief — investment approach, known portfolio or background facts",
  "investmentMandate": "1-2 sentences on what they actually invest in — sectors, stages, check sizes if known",
  "personalisationHook": "one concrete specific hook — sector overlap, known portfolio, public statement, or university connection. No generic compliments.",
  "subject": "email subject line",
  "emailBody": "3 short paragraphs. Open: ${tone.open.replace("{first}", firstName)}. Paragraph 1: the hook. Paragraph 2: fund thesis + one proof point. Paragraph 3: the ask. Sign off:\\n${brief.senderName}\\n${brief.senderRole}\\n${brief.senderLinkedIn}",
  "linkedInDM": "LinkedIn DM ≤${tone.dmMax} chars. Warm. Name-first (Hi ${firstName}). Reference hook. CTA: ${tone.cta}"
}`

  const resp = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1100,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  })

  const raw = (resp.content[0] as Anthropic.TextBlock).text.trim()
  let parsed: Record<string, string>
  try {
    const m = raw.match(/\{[\s\S]+\}/)
    parsed = JSON.parse(m?.[0] ?? raw)
  } catch {
    parsed = {
      firmIntelligence: profile.investmentFocusExtracted || profile.metaDescription || "",
      investmentMandate: profile.whyThisContact || "",
      personalisationHook: `Your focus on ${profile.sectors.split(",")[0] ?? "this sector"} aligns with our university-originated deal flow.`,
      subject: `${brief.fundName} — brief introduction`,
      emailBody: `${tone.open.replace("{first}", firstName)}\n\n${profile.whyThisContact}\n\n${tone.cta}\n\n${brief.senderName}\n${brief.senderRole}`,
      linkedInDM: `Hi ${firstName} — ${brief.senderName.split(" ")[0]} here, ${brief.senderRole.split(",")[0]}. ${tone.cta}`.slice(0, tone.dmMax),
    }
  }

  let dm = parsed.linkedInDM ?? ""
  if (dm.length > tone.dmMax) dm = dm.slice(0, tone.dmMax - 1) + "…"

  const enriched: EnrichedProfile = {
    ...profile,
    firmIntelligence: parsed.firmIntelligence ?? "",
    investmentMandate: parsed.investmentMandate ?? "",
    personalisationHook: parsed.personalisationHook ?? "",
    isMultiTouch: Boolean(priorContact),
    multiTouchPriorContact: priorContact,
    batch: batchNum,
  }

  const draft: DraftedEmail = {
    investorId: profile.id,
    name: profile.name,
    lpType: profile.lpType,
    email: profile.email,
    subject: parsed.subject ?? "",
    body: parsed.emailBody ?? "",
    primaryChannel: tone.channel as "email" | "linkedin",
    linkedInDM: dm,
    voiceNotes: `${profile.lpType} tone applied`,
    outreachStatus: "Draft",
  }

  return { enriched, draft }
}

// ─── GET — health check ───────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "POST /api/outreach/lp-campaign",
    fund: SVS_SENDER_BRIEF.fundName,
    sender: SVS_SENDER_BRIEF.senderName,
  })
}

// ─── POST — streaming pipeline ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 })
  }

  let body: { profiles?: InvestorProfile[]; limit?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { profiles: rawProfiles = [], limit } = body
  const profiles = limit ? rawProfiles.slice(0, limit) : rawProfiles

  if (profiles.length === 0) {
    return NextResponse.json({ error: "No profiles provided" }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const BATCH_SIZE = 10
  const BATCH_DELAY = 2000

  const batches = chunk(profiles, BATCH_SIZE)

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (data: object) => controller.enqueue(enc.encode(sse(data)))

      try {
        const enrichedAll: EnrichedProfile[] = []
        const draftsAll: DraftedEmail[] = []
        let done = 0

        for (let bi = 0; bi < batches.length; bi++) {
          const batch = batches[bi]!
          send({ type: "batch", batchNum: bi + 1, batchTotal: batches.length })

          const batchResults = await Promise.all(
            batch.map(async (p) => {
              const prior = findPriorFirmContact(p, profiles)
              const result = await enrichAndDraft(p, prior, bi + 1, anthropic)
              done++
              send({ type: "progress", step: "enrich", done, total: profiles.length, name: p.name })
              return result
            })
          )

          for (const r of batchResults) {
            enrichedAll.push(r.enriched)
            draftsAll.push(r.draft)
          }

          if (bi < batches.length - 1) await sleep(BATCH_DELAY)
        }

        // Build stats
        const byLPType: Record<string, number> = {}
        const byChannel: Record<string, number> = {}
        for (const e of enrichedAll) byLPType[e.lpType] = (byLPType[e.lpType] ?? 0) + 1
        for (const d of draftsAll) byChannel[d.primaryChannel] = (byChannel[d.primaryChannel] ?? 0) + 1

        const result: PipelineResult = {
          enriched: enrichedAll,
          drafts: draftsAll,
          generatedAt: new Date().toISOString(),
          stats: {
            total: enrichedAll.length,
            batches: batches.length,
            multiTouchCount: enrichedAll.filter((e) => e.isMultiTouch).length,
            avgScore: Math.round(enrichedAll.reduce((s, e) => s + (e.score ?? 0), 0) / enrichedAll.length),
            byLPType,
            byTier: {},
            byChannel: byChannel as PipelineResult["stats"]["byChannel"],
            tier1Count: enrichedAll.filter((e) => (e.score ?? 0) >= 60).length,
          },
        }

        send({ type: "result", data: result })
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}

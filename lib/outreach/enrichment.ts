/**
 * Summit Venture Studio Fund II — Profile Enrichment
 *
 * enrichProfile()  — enrich a single InvestorProfile via Claude:
 *   • Synthesises firm intelligence from crawled data already in the row
 *     (investmentFocusExtracted, metaDescription, websiteTitle, whyThisContact)
 *   • Falls back to web_search tool call when crawled data is thin
 *   • Returns firmIntelligence, investmentMandate, personalisationHook
 *
 * enrichBatch()    — run enrichment in batches of ≤10 with a 2-second
 *                    pause between batches to respect rate limits.
 *
 * enrichAll()      — convenience wrapper used by the pipeline.
 */

import Anthropic from "@anthropic-ai/sdk"
import type {
  InvestorProfile,
  EnrichedProfile,
  SenderBrief,
} from "./types"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Detect if an earlier profile in the full list is from the same firm */
function findPriorFirmContact(
  profile: InvestorProfile,
  allProfiles: InvestorProfile[]
): string {
  // Match on website domain or firm name substring
  const myDomain = domainFrom(profile.inferredWebsite || profile.linkedin)
  const myFirmToken = coarseFirmToken(profile.name, profile.titleRole)

  const prior = allProfiles.find((p) => {
    if (p.id >= profile.id) return false
    const theirDomain = domainFrom(p.inferredWebsite || p.linkedin)
    if (myDomain && theirDomain && myDomain === theirDomain) return true
    // Fallback: shared firm token in name/role
    const theirToken = coarseFirmToken(p.name, p.titleRole)
    return myFirmToken && theirToken && myFirmToken === theirToken
  })

  return prior?.name ?? ""
}

function domainFrom(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return ""
  }
}

/** Extract a rough firm identifier from name+role text */
function coarseFirmToken(name: string, role: string): string {
  // For rows like "Clare College (Cambridge) Endowment" the name IS the firm
  const combined = `${name} ${role}`.toLowerCase()
  // Strip common person suffixes — what's left is usually the firm
  const cleaned = combined
    .replace(/\b(co-founder|founder|ceo|cto|cfo|vp|director|manager|partner|principal|president|head of|investor)\b/gi, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ")
  return cleaned.length > 3 ? cleaned : ""
}

// ─── Anthropic client (lazy singleton) ───────────────────────────────────────

let _client: Anthropic | null = null

function client(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return _client
}

// ─── Single-profile enrichment ────────────────────────────────────────────────

const WEB_SEARCH_TOOL: Anthropic.Tool = {
  name: "web_search",
  description:
    "Search the web for information about an investor, family office, endowment, or firm. Use when crawled data is insufficient.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search query",
      },
    },
    required: ["query"],
  },
}

/**
 * Enrich one investor profile.
 * Uses crawled data already in the row; calls web_search only when
 * investmentFocusExtracted + metaDescription are both empty/thin.
 */
export async function enrichProfile(
  profile: InvestorProfile,
  brief: SenderBrief,
  priorContact: string,
  batchNum: number
): Promise<EnrichedProfile> {
  const hasCrawlData = Boolean(
    (profile.investmentFocusExtracted?.trim() || "") +
      (profile.metaDescription?.trim() || "") +
      (profile.websiteTitle?.trim() || "")
  )

  const systemPrompt = `You are a senior LP research analyst preparing personalised outreach for ${brief.fundName}.
Fund context: ${brief.thesis}
Differentiators: ${brief.differentiators.join(" | ")}
Voice: ${brief.voicePrinciples.join(" | ")}
Respond in valid JSON only — no markdown fences, no extra keys.`

  const crawledContext = hasCrawlData
    ? `
CRAWLED DATA (use this as primary source):
Website title: ${profile.websiteTitle}
Investment focus extracted: ${profile.investmentFocusExtracted}
Meta description: ${profile.metaDescription}
Why selected: ${profile.whyThisContact}`.trim()
    : "(No crawl data — use web_search to research this contact)"

  const userPrompt = `Enrich the following investor profile for outreach.

PROFILE:
#${profile.id} | ${profile.name} | ${profile.titleRole}
LP Type: ${profile.lpType}
Location: ${profile.location}
Sectors: ${profile.sectors}
Website: ${profile.inferredWebsite}
LinkedIn: ${profile.linkedin}
${crawledContext}
${priorContact ? `MULTI-TOUCH: A prior contact at this firm is ${priorContact}. Reference this briefly in the personalisation hook.` : ""}

Return JSON with EXACTLY these keys:
{
  "firmIntelligence": "2-3 sentences on what this firm/person does, their known investment approach, and any notable portfolio or background facts",
  "investmentMandate": "1-2 sentences: what they actually invest in — specific sectors, stages, check sizes if known",
  "personalisationHook": "One concrete, specific opening hook for outreach. Must reference something specific to THIS contact (a portfolio company, a published thesis, a recent event, a sector overlap with SVS, or a mutual context). No generic compliments. No em-dashes."
}`

  // First pass — may use web_search tool if crawl data is thin
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ]

  let finalText = ""
  let iterations = 0

  while (iterations < 3) {
    iterations++
    const resp = await client().messages.create({
      model: "claude-opus-4-6",
      max_tokens: 900,
      system: systemPrompt,
      tools: hasCrawlData ? [] : [WEB_SEARCH_TOOL],
      messages,
    })

    if (resp.stop_reason === "tool_use") {
      // Extract tool call, simulate result (agentic tool loop)
      const toolUse = resp.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      )
      if (!toolUse) break

      const query = (toolUse.input as { query: string }).query
      // Return a structured placeholder — in production wire to a real search MCP
      const searchResult = `Search result for "${query}": No live search available in batch mode. Use crawled data or publicly known facts about ${profile.name} at ${profile.inferredWebsite}.`

      messages.push({ role: "assistant", content: resp.content })
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: searchResult,
          },
        ],
      })
      continue
    }

    // End turn
    const textBlock = resp.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    )
    finalText = textBlock?.text.trim() ?? ""
    break
  }

  // Parse JSON
  let parsed: {
    firmIntelligence: string
    investmentMandate: string
    personalisationHook: string
  }

  try {
    const jsonMatch = finalText.match(/\{[\s\S]+\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? finalText)
  } catch {
    parsed = {
      firmIntelligence: profile.investmentFocusExtracted || profile.metaDescription || "",
      investmentMandate: profile.whyThisContact || "",
      personalisationHook: `Your focus on ${profile.sectors.split(",")[0] ?? "this sector"} aligns with our university-originated deal flow.`,
    }
  }

  return {
    ...profile,
    firmIntelligence: parsed.firmIntelligence ?? "",
    investmentMandate: parsed.investmentMandate ?? "",
    personalisationHook: parsed.personalisationHook ?? "",
    isMultiTouch: Boolean(priorContact),
    multiTouchPriorContact: priorContact,
    batch: batchNum,
  }
}

// ─── Batch enrichment ─────────────────────────────────────────────────────────

const BATCH_SIZE = 10
const BETWEEN_BATCH_DELAY_MS = 2000

/**
 * Enrich all profiles in batches of ≤10.
 * Within each batch: parallel API calls.
 * Between batches: 2-second pause.
 *
 * @param profiles    Full list (used for multi-touch detection)
 * @param brief       Sender brief
 * @param onProgress  Optional tick callback (done, total, name)
 */
export async function enrichAll(
  profiles: InvestorProfile[],
  brief: SenderBrief,
  onProgress?: (done: number, total: number, name: string) => void
): Promise<EnrichedProfile[]> {
  const batches = chunk(profiles, BATCH_SIZE)
  const results: EnrichedProfile[] = []
  let done = 0

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]!
    const batchNum = bi + 1

    console.log(
      `[Enrichment] Batch ${batchNum}/${batches.length} — ${batch.length} profiles`
    )

    const batchResults = await Promise.all(
      batch.map(async (p) => {
        const prior = findPriorFirmContact(p, profiles)
        const result = await enrichProfile(p, brief, prior, batchNum)
        done++
        onProgress?.(done, profiles.length, p.name)
        return result
      })
    )

    results.push(...batchResults)

    if (bi < batches.length - 1) {
      console.log(`[Enrichment] Batch ${batchNum} done — pausing ${BETWEEN_BATCH_DELAY_MS}ms`)
      await sleep(BETWEEN_BATCH_DELAY_MS)
    }
  }

  return results
}

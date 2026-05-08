/**
 * Investor profile builder — multi-source aggregation.
 *
 * Pulls signal from every source we can legitimately reach:
 *
 *   1. The firm's own site (team / portfolio / thesis pages) via
 *      `lib/agents/portfolio-search.ts`
 *   2. The investor's LinkedIn public snippet (login wall most of the
 *      time, but the SEO description occasionally gives a 1-line bio)
 *      via `lib/agents/linkedin-public.ts`
 *   3. The firm's enrichment data already in the DB (sectors, stages,
 *      check size)
 *   4. Optional Twitter / X handle if surfaced
 *
 * Then asks the local AI's `investor_profile` task (balanced tier) to
 * synthesize:
 *
 *   - one-line headline ("Partner at Acme Ventures, focuses on…")
 *   - 2-3 sentence summary
 *   - sectors (canonical tags)
 *   - 3-5 deals they led (cited)
 *   - 3-5 talking points an outreach DM could anchor on
 *   - red flags (e.g. their LinkedIn last activity was a year ago, or
 *     the firm pages disagree about their title)
 *
 * Output is shaped to feed both the outreach composer (gives the DM
 * personalizer richer context) and the CRM inspector card.
 */

import { sql } from "@/lib/db"
import { generate } from "@/lib/ai/provider"
import { fetchLinkedInPublic, type LinkedInPublicSnippet } from "./linkedin-public"
import { searchFirmPortfolio, type PortfolioSearchResult } from "./portfolio-search"

export interface BuildProfileInput {
  /** Either pass an investorId OR enough free-form context to identify them. */
  investorId?: string
  /** The firm they work at — used to seed the portfolio search. */
  firmId?: string
  /** Override URLs.  When investorId is set we pull these from the DB. */
  linkedinUrl?: string
  firmWebsite?: string
  /** Extra text the user wants the model to consider (e.g. a recent
   *  LinkedIn post the user pasted, a press release excerpt). */
  extraContext?: string
}

export interface InvestorProfile {
  /** Best-known full name (from DB, LinkedIn snippet, or extra context). */
  fullName: string
  title: string | null
  firm: string | null
  firmId: string | null
  /** One-line headline for the CRM card. */
  headline: string
  summary: string
  sectors: string[]
  stages: string[]
  /** Citations that back each claim. */
  citations: { label: string; url: string }[]
  /** Deals attributed to this person (from portfolio search). */
  attributedDeals: { name: string; role?: string; year?: number; sector?: string }[]
  /** Recent posts / blog signals if surfaced. */
  recentSignals: { source: "linkedin" | "firm-blog" | "press" | "other"; text: string; url?: string }[]
  /** Suggested DM hooks — the personalizer reads these to skip its own
   *  hook discovery step.  Each item is one short phrase the founder
   *  could anchor on. */
  talkingPoints: string[]
  /** Things the public data didn't surface — useful for the founder
   *  to pre-emptively answer in the DM. */
  openQuestions: string[]
  redFlags: string[]
  confidence: number
  generatedBy: string
  /** Raw evidence the synthesis read from. */
  evidence: {
    portfolioSearch: PortfolioSearchResult | null
    linkedinSnippet: LinkedInPublicSnippet | null
    extraContext?: string
  }
  durationMs: number
}

const MAX_TEXT_FOR_AI = 18_000

export async function buildInvestorProfile(input: BuildProfileInput): Promise<InvestorProfile> {
  const t0 = Date.now()
  // 1. Resolve the investor + firm rows ────────────────────────────────
  let investorRow: any = null
  let firmRow: any = null
  if (input.investorId) {
    const [r] = await sql`SELECT * FROM investors WHERE id = ${input.investorId} LIMIT 1`
    investorRow = r ?? null
    if (investorRow?.firm_id) {
      const [f] = await sql`SELECT * FROM investment_firms WHERE id = ${investorRow.firm_id} LIMIT 1`
      firmRow = f ?? null
    }
  }
  if (input.firmId && !firmRow) {
    const [f] = await sql`SELECT * FROM investment_firms WHERE id = ${input.firmId} LIMIT 1`
    firmRow = f ?? null
  }

  const fullName = displayName(investorRow) || (input.linkedinUrl ? "Investor" : "Unknown investor")
  const linkedinUrl = input.linkedinUrl ?? investorRow?.linkedin_url ?? investorRow?.person_linkedin_url ?? null
  const firmWebsite = input.firmWebsite ?? firmRow?.website ?? null
  const firmName = firmRow?.name ?? null

  // 2. Run the two parallel evidence fetchers ──────────────────────────
  const [portfolioSearch, linkedinSnippet] = await Promise.all([
    firmWebsite ? searchFirmPortfolio({
      firmId: firmRow?.id ?? input.firmId, firmUrl: firmWebsite, maxPages: 6,
    }).catch(() => null) : Promise.resolve(null),
    linkedinUrl ? fetchLinkedInPublic(linkedinUrl).catch(() => null) : Promise.resolve(null),
  ])

  // 3. Find any deals attributed to this investor in the portfolio data ──
  let attributedDeals: InvestorProfile["attributedDeals"] = []
  if (portfolioSearch) {
    const lower = fullName.toLowerCase()
    attributedDeals = portfolioSearch.portfolio
      .filter((c) => c.leadPartner && c.leadPartner.toLowerCase() === lower)
      .map((c) => ({ name: c.name, role: c.role, year: c.year, sector: c.sector }))
  }

  // 4. Build the synthesis prompt ──────────────────────────────────────
  const corpus = buildCorpus({
    investorRow, firmRow, linkedinSnippet, portfolioSearch,
    attributedDeals, extraContext: input.extraContext,
  })

  const synthesized = await synthesize(fullName, firmName, corpus)
  const generatedBy = (synthesized as any)._generatedBy ?? "heuristic"
  delete (synthesized as any)._generatedBy

  // 5. Build citations from the evidence we have ───────────────────────
  const citations: InvestorProfile["citations"] = []
  if (linkedinSnippet?.finalUrl) citations.push({ label: "LinkedIn", url: linkedinSnippet.finalUrl })
  for (const p of portfolioSearch?.pagesUsed ?? []) {
    citations.push({ label: prettyLabel(p.url), url: p.url })
  }

  return {
    fullName,
    title: synthesized.title ?? investorRow?.title ?? linkedinSnippet?.extracted.title ?? null,
    firm: firmName ?? linkedinSnippet?.extracted.firm ?? null,
    firmId: firmRow?.id ?? input.firmId ?? null,
    headline: synthesized.headline ?? "",
    summary: synthesized.summary ?? "",
    sectors: synthesized.sectors ?? [],
    stages: synthesized.stages ?? [],
    citations,
    attributedDeals,
    recentSignals: synthesized.recentSignals ?? [],
    talkingPoints: synthesized.talkingPoints ?? [],
    openQuestions: synthesized.openQuestions ?? [],
    redFlags: synthesized.redFlags ?? [],
    confidence: synthesized.confidence ?? 0.4,
    generatedBy,
    evidence: { portfolioSearch, linkedinSnippet, extraContext: input.extraContext },
    durationMs: Date.now() - t0,
  }
}

// ─── helpers ───────────────────────────────────────────────────────────
function displayName(r: any): string {
  if (!r) return ""
  return [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || ""
}

function prettyLabel(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`
  } catch { return url }
}

function buildCorpus(args: {
  investorRow: any
  firmRow: any
  linkedinSnippet: LinkedInPublicSnippet | null
  portfolioSearch: PortfolioSearchResult | null
  attributedDeals: InvestorProfile["attributedDeals"]
  extraContext?: string
}): string {
  const parts: string[] = []

  if (args.investorRow) {
    parts.push(`--- DB record (investors) ---
name: ${[args.investorRow.first_name, args.investorRow.last_name].filter(Boolean).join(" ")}
title: ${args.investorRow.title ?? ""}
bio: ${args.investorRow.bio ?? ""}
sectors: ${jsonOrEmpty(args.investorRow.sectors)}
location: ${args.investorRow.location ?? ""}`)
  }
  if (args.firmRow) {
    parts.push(`--- DB record (investment_firms) ---
name: ${args.firmRow.name}
type: ${args.firmRow.type ?? args.firmRow.firm_type ?? ""}
description: ${args.firmRow.description ?? ""}
sectors: ${jsonOrEmpty(args.firmRow.sectors)}
stages: ${jsonOrEmpty(args.firmRow.stages)}
hq: ${args.firmRow.hq_location ?? ""}
check size: ${args.firmRow.check_size_range ?? `${args.firmRow.check_size_min ?? ""} - ${args.firmRow.check_size_max ?? ""}`}`)
  }
  if (args.linkedinSnippet) {
    const ls = args.linkedinSnippet
    parts.push(`--- LinkedIn public snippet (loginWall=${ls.loginWall}) ---
title: ${ls.displayLabel ?? ""}
description: ${ls.description ?? ""}
fullName: ${ls.extracted.fullName ?? ""}
title: ${ls.extracted.title ?? ""}
firm: ${ls.extracted.firm ?? ""}
location: ${ls.extracted.location ?? ""}
summary: ${ls.extracted.summary ?? ""}
pastFirms: ${(ls.extracted.pastFirms ?? []).join(", ")}
${ls.bodyText ? `body: ${ls.bodyText.slice(0, 1500)}` : ""}`)
  }
  if (args.portfolioSearch) {
    const ps = args.portfolioSearch
    parts.push(`--- Firm portfolio search ---
team (${ps.team.length}): ${ps.team.map((t) => `${t.fullName}${t.title ? ` (${t.title})` : ""}`).join("; ")}
portfolio (${ps.portfolio.length}): ${ps.portfolio.slice(0, 25).map((c) => `${c.name}${c.year ? ` ${c.year}` : ""}${c.leadPartner ? ` led by ${c.leadPartner}` : ""}`).join("; ")}`)
  }
  if (args.attributedDeals.length) {
    parts.push(`--- Deals attributed to this person ---
${args.attributedDeals.map((d) => `${d.name}${d.year ? ` (${d.year})` : ""}${d.role ? ` — ${d.role}` : ""}${d.sector ? ` — ${d.sector}` : ""}`).join("\n")}`)
  }
  if (args.extraContext) parts.push(`--- Extra context (user-provided) ---\n${args.extraContext.slice(0, 2000)}`)
  return parts.join("\n\n")
}

function jsonOrEmpty(v: any): string {
  if (Array.isArray(v)) return v.join(", ")
  if (typeof v === "string") return v
  if (v == null) return ""
  return String(v)
}

// ─── synthesis ─────────────────────────────────────────────────────────
async function synthesize(
  fullName: string,
  firmName: string | null,
  corpus: string,
): Promise<{
  title?: string | null
  headline?: string
  summary?: string
  sectors?: string[]
  stages?: string[]
  recentSignals?: { source: "linkedin" | "firm-blog" | "press" | "other"; text: string; url?: string }[]
  talkingPoints?: string[]
  openQuestions?: string[]
  redFlags?: string[]
  confidence?: number
  _generatedBy?: string
}> {
  const prompt = `You are a research analyst writing a 1-page profile of an investor for use in a fundraising outreach DM.  Use ONLY the evidence below.  Do not invent facts; if something isn't in the evidence, omit it or list it under "openQuestions".

Investor: ${fullName}
Firm: ${firmName ?? "—"}

Evidence:
"""
${corpus.slice(0, MAX_TEXT_FOR_AI)}
"""

Return ONLY this JSON object — no prose, no markdown:

{
  "title": "<job title at the firm — Partner / GP / Principal / etc., or null>",
  "headline": "<one sentence: '<Title> at <Firm>, focuses on <thesis-1-liner>'>",
  "summary": "<2-3 sentence summary, citing specific signals from evidence>",
  "sectors": ["<lowercase canonical tags: ai/ml, fintech, climate, healthtech, deeptech, consumer, saas, ...>"],
  "stages": ["<pre-seed | seed | series-a | series-b | series-c | growth>"],
  "recentSignals": [
    { "source": "linkedin" | "firm-blog" | "press" | "other", "text": "<one-sentence signal>", "url": "<source url if available>" }
  ],
  "talkingPoints": [
    "<3-5 short phrases a founder could anchor a DM on — be specific to this investor, not generic>"
  ],
  "openQuestions": [
    "<3-5 things NOT in the public evidence that the founder should expect to be asked>"
  ],
  "redFlags": [
    "<0-3 inconsistencies / staleness signals / things to verify before reaching out>"
  ],
  "confidence": <0..1>
}

If the evidence is too sparse to write a real profile, return all fields with null/empty arrays and explain in redFlags.`
  const text = await generate(prompt, { task: "investor_profile", maxTokens: 1400, temperature: 0.3, json: true })
  const parsed = parseJson(text)
  if (!parsed) return { confidence: 0.2, _generatedBy: "heuristic" }
  return { ...normalize(parsed), _generatedBy: "ollama:investor_profile" }
}

function normalize(raw: any) {
  const out: any = {}
  if (typeof raw.title === "string") out.title = raw.title.trim()
  if (typeof raw.headline === "string") out.headline = raw.headline.trim()
  if (typeof raw.summary === "string") out.summary = raw.summary.trim()
  if (Array.isArray(raw.sectors)) out.sectors = raw.sectors.filter((s: any) => typeof s === "string").map((s: string) => s.toLowerCase().trim())
  if (Array.isArray(raw.stages)) out.stages = raw.stages.filter((s: any) => typeof s === "string").map((s: string) => s.toLowerCase().trim().replace(/\s+/g, "-"))
  if (Array.isArray(raw.recentSignals)) out.recentSignals = raw.recentSignals.filter((s: any) => s && typeof s.text === "string").slice(0, 8)
  if (Array.isArray(raw.talkingPoints)) out.talkingPoints = raw.talkingPoints.filter((s: any) => typeof s === "string").slice(0, 8)
  if (Array.isArray(raw.openQuestions)) out.openQuestions = raw.openQuestions.filter((s: any) => typeof s === "string").slice(0, 6)
  if (Array.isArray(raw.redFlags)) out.redFlags = raw.redFlags.filter((s: any) => typeof s === "string").slice(0, 5)
  if (typeof raw.confidence === "number") out.confidence = Math.max(0, Math.min(1, raw.confidence))
  return out
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

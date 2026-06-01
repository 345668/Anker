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
   *  could anchor on.  Ordered by relevance for first outreach. */
  talkingPoints: string[]
  /** SINGLE best hook for the day-0 email/DM.  Pre-selected so the
   *  personalizer can plug it straight into the template.  Composed from
   *  the freshest, most specific signal (a recent post > a recent deal
   *  > a thesis paragraph > a sector match). */
  primaryHook: {
    source: "linkedin-post" | "firm-blog" | "press" | "portfolio-deal" | "thesis-page" | "sector-match" | "other"
    text: string
    url?: string
    /** Free-text recency hint ("2 weeks ago", "Q1 2026", "this month"). */
    recency?: string
    /** Why this hook is strong — 1-line internal note. */
    why?: string
  } | null
  /** Firm-level thesis distilled to 1-2 sentences.  Feeds the day-0
   *  bridge: "your X thesis mirrors what we saw building Y". */
  fundThesis: string | null
  /** When did this person last lead a publicly-visible deal?  Used to
   *  gauge cadence + urgency (a partner who hasn't led in 18 months may
   *  not be deploying). */
  lastInvestmentSignal: {
    date?: string          // ISO date or "Q1 2026" or "2024"
    deal?: string
    source?: string
  } | null
  /** Inferred urgency of outreach.  high = fund clearly deploying or
   *  partner recently active; medium = some signal; low = stale. */
  urgency: "high" | "medium" | "low"
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

  // 6. Derive first-outreach helpers from the synthesized + raw evidence.
  const recentSignals = synthesized.recentSignals ?? []
  const primaryHook = pickPrimaryHook({
    synthesized,
    recentSignals,
    attributedDeals,
    firmRow,
    linkedinSnippet,
  })
  const fundThesis = synthesized.fundThesis ?? deriveFundThesis(firmRow)
  const lastInvestmentSignal = synthesized.lastInvestmentSignal ?? deriveLastInvestment(attributedDeals)
  const urgency = synthesized.urgency ?? inferUrgency(lastInvestmentSignal, recentSignals)

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
    recentSignals,
    talkingPoints: synthesized.talkingPoints ?? [],
    primaryHook,
    fundThesis,
    lastInvestmentSignal,
    urgency,
    openQuestions: synthesized.openQuestions ?? [],
    redFlags: synthesized.redFlags ?? [],
    confidence: synthesized.confidence ?? 0.4,
    generatedBy,
    evidence: { portfolioSearch, linkedinSnippet, extraContext: input.extraContext },
    durationMs: Date.now() - t0,
  }
}

// ─── First-outreach helpers ────────────────────────────────────────────
function pickPrimaryHook(args: {
  synthesized: any
  recentSignals: InvestorProfile["recentSignals"]
  attributedDeals: InvestorProfile["attributedDeals"]
  firmRow: any
  linkedinSnippet: LinkedInPublicSnippet | null
}): InvestorProfile["primaryHook"] {
  // If the model gave us an explicit primaryHook, honour it.
  if (args.synthesized?.primaryHook && typeof args.synthesized.primaryHook.text === "string") {
    const p = args.synthesized.primaryHook
    return {
      source: ([
        "linkedin-post", "firm-blog", "press", "portfolio-deal", "thesis-page", "sector-match", "other",
      ].includes(p.source) ? p.source : "other") as any,
      text: String(p.text).trim().slice(0, 280),
      url: typeof p.url === "string" ? p.url : undefined,
      recency: typeof p.recency === "string" ? p.recency : undefined,
      why: typeof p.why === "string" ? p.why : undefined,
    }
  }
  // Heuristic: prefer most recent linkedin/firm-blog signal, fall back
  // to most recent attributed deal, then thesis line, then sector match.
  const sortedSignals = (args.recentSignals ?? []).slice().sort((a, b) => {
    const order = { linkedin: 0, "firm-blog": 1, press: 2, other: 3 } as Record<string, number>
    return (order[a.source] ?? 4) - (order[b.source] ?? 4)
  })
  if (sortedSignals[0]) {
    return {
      source: sortedSignals[0].source === "linkedin" ? "linkedin-post"
            : sortedSignals[0].source === "firm-blog" ? "firm-blog"
            : sortedSignals[0].source === "press" ? "press" : "other",
      text: sortedSignals[0].text,
      url: sortedSignals[0].url,
      why: "freshest signal in evidence",
    }
  }
  if (args.attributedDeals[0]) {
    const d = args.attributedDeals[0]
    return {
      source: "portfolio-deal",
      text: `${d.name}${d.year ? ` (${d.year})` : ""}${d.sector ? ` — ${d.sector}` : ""}${d.role ? ` — ${d.role}` : ""}`,
      why: "most recent attributed deal",
    }
  }
  if (args.firmRow?.thesis || args.firmRow?.description) {
    const text = String(args.firmRow.thesis ?? args.firmRow.description).split(/\.\s+/)[0]?.slice(0, 240)
    if (text) return { source: "thesis-page", text, why: "firm thesis paragraph" }
  }
  const sectors = Array.isArray(args.firmRow?.sectors) ? args.firmRow.sectors : []
  if (sectors[0]) {
    return { source: "sector-match", text: `${args.firmRow?.name ?? "the firm"} focuses on ${sectors.slice(0, 3).join(", ")}`, why: "sector-only fallback" }
  }
  return null
}

function deriveFundThesis(firmRow: any): string | null {
  if (!firmRow) return null
  const candidates = [firmRow.thesis, firmRow.description].filter(Boolean)
  if (!candidates.length) return null
  const raw = String(candidates[0])
  // Take first 1-2 sentences, max 280 chars.
  const sentences = raw.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)
  const out = sentences.slice(0, 2).join(" ").slice(0, 280)
  return out || null
}

function deriveLastInvestment(deals: InvestorProfile["attributedDeals"]): InvestorProfile["lastInvestmentSignal"] {
  if (!deals?.length) return null
  // Pick the deal with the most-recent year if present.
  const sorted = deals.slice().sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  const top = sorted[0]
  if (!top) return null
  return {
    date: top.year ? String(top.year) : undefined,
    deal: top.name,
    source: top.role ?? top.sector,
  }
}

function inferUrgency(
  last: InvestorProfile["lastInvestmentSignal"],
  signals: InvestorProfile["recentSignals"],
): InvestorProfile["urgency"] {
  // Heuristic: linkedin posts within last 90 days OR a deal in the
  // current calendar year ⇒ high.  Deal in last 2 years OR a signal ⇒
  // medium.  Otherwise low.
  const thisYear = new Date().getUTCFullYear()
  const recentSignalKnown = (signals ?? []).some((s) => /\bweek|\bday|\bmonth|\b202[5-9]/i.test((s.text ?? "") + (s.url ?? "")))
  const lastYearNum = last?.date ? Number(String(last.date).match(/(\d{4})/)?.[1] ?? 0) : 0
  if (recentSignalKnown || lastYearNum >= thisYear - 1) return "high"
  if ((signals ?? []).length > 0 || lastYearNum >= thisYear - 3) return "medium"
  return "low"
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
  primaryHook?: InvestorProfile["primaryHook"]
  fundThesis?: string | null
  lastInvestmentSignal?: InvestorProfile["lastInvestmentSignal"]
  urgency?: InvestorProfile["urgency"]
  openQuestions?: string[]
  redFlags?: string[]
  confidence?: number
  _generatedBy?: string
}> {
  const prompt = `You are a research analyst writing a profile of an investor for a FIRST cold-outreach email/DM.  Use ONLY the evidence below.  Do not invent facts; if something isn't in the evidence, omit it or list it under "openQuestions".

Investor: ${fullName}
Firm: ${firmName ?? "—"}

Evidence:
"""
${corpus.slice(0, MAX_TEXT_FOR_AI)}
"""

Your job is to produce the SHORTEST possible profile that maximises reply rate on a first outreach.  Specifically:
  - Pick ONE best hook the founder can anchor day-0 on.  Prefer the freshest, most specific signal: a recent LinkedIn post > a recent deal led > a firm blog/thesis line > a sector match.  NEVER pick a hook that's generic ("you invest in AI"); always specific ("your thread last week on agent reliability" / "your seed lead into Acme in Q1 2026").
  - "talkingPoints" are RANKED — most useful first.
  - Distill the firm thesis into 1-2 sentences (max 280 chars).  This is the "bridge" the day-0 email uses.
  - Estimate urgency: high if there's a signal in the last 90 days OR a deal led this year; medium if a signal exists but is older; low if data is stale or the partner looks dormant.

Return ONLY this JSON object — no prose, no markdown:

{
  "title": "<Partner / GP / Principal / etc., or null>",
  "headline": "<one sentence: '<Title> at <Firm>, focuses on <thesis-1-liner>'>",
  "summary": "<2-3 sentence summary, citing specific signals from evidence>",
  "sectors": ["<lowercase canonical tags: ai/ml, fintech, climate, healthtech, deeptech, consumer, saas, ...>"],
  "stages": ["<pre-seed | seed | series-a | series-b | series-c | growth>"],
  "fundThesis": "<1-2 sentence distilled thesis the day-0 email will bridge off>",
  "recentSignals": [
    { "source": "linkedin" | "firm-blog" | "press" | "other", "text": "<one-sentence signal — be specific, include a date hint>", "url": "<source url if available>" }
  ],
  "primaryHook": {
    "source": "linkedin-post" | "firm-blog" | "press" | "portfolio-deal" | "thesis-page" | "sector-match" | "other",
    "text": "<the ONE phrase the day-0 email will hook off — be SPECIFIC and SHORT (one clause, no more than 25 words)>",
    "url": "<source url if available>",
    "recency": "<'this week' | '2 weeks ago' | 'Q1 2026' | etc.>",
    "why": "<1-line note: why this hook is strong relative to other evidence>"
  },
  "lastInvestmentSignal": {
    "date": "<ISO yyyy-mm-dd OR 'Q1 2026' OR '2024' OR null if unknown>",
    "deal": "<deal name or null>",
    "source": "<one-liner where this comes from>"
  },
  "urgency": "high" | "medium" | "low",
  "talkingPoints": [
    "<3-5 short phrases, RANKED most useful first.  Each should be specific enough that a founder could quote it in a DM without sounding generic.>"
  ],
  "openQuestions": [
    "<3-5 things NOT in the public evidence that the founder should expect to be asked>"
  ],
  "redFlags": [
    "<0-3 inconsistencies / staleness signals / things to verify before reaching out>"
  ],
  "confidence": <0..1>
}

If the evidence is too sparse, set primaryHook to null and explain in redFlags.`
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
  if (typeof raw.fundThesis === "string") out.fundThesis = raw.fundThesis.trim().slice(0, 280)
  if (raw.primaryHook && typeof raw.primaryHook === "object" && typeof raw.primaryHook.text === "string") {
    out.primaryHook = {
      source: raw.primaryHook.source ?? "other",
      text: String(raw.primaryHook.text).trim().slice(0, 280),
      url: typeof raw.primaryHook.url === "string" ? raw.primaryHook.url : undefined,
      recency: typeof raw.primaryHook.recency === "string" ? raw.primaryHook.recency : undefined,
      why: typeof raw.primaryHook.why === "string" ? raw.primaryHook.why : undefined,
    }
  }
  if (raw.lastInvestmentSignal && typeof raw.lastInvestmentSignal === "object") {
    out.lastInvestmentSignal = {
      date: typeof raw.lastInvestmentSignal.date === "string" ? raw.lastInvestmentSignal.date : undefined,
      deal: typeof raw.lastInvestmentSignal.deal === "string" ? raw.lastInvestmentSignal.deal : undefined,
      source: typeof raw.lastInvestmentSignal.source === "string" ? raw.lastInvestmentSignal.source : undefined,
    }
  }
  if (raw.urgency === "high" || raw.urgency === "medium" || raw.urgency === "low") out.urgency = raw.urgency
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

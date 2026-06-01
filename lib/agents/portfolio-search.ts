/**
 * Portfolio search — given an investment firm (id OR website), find:
 *   - the firms they've invested in (portfolio companies)
 *   - the named partners / principals associated with each
 *   - which partner led each deal (when the firm publishes that)
 *
 * We do this by crawling the firm's own pages — `team` and `portfolio`
 * are the priority targets — and then asking the local AI's `fast`
 * tier to extract a structured list.  Pure public-data; no third-party
 * scraping.
 *
 * Output is shaped to feed:
 *   - the investor-profile builder (lib/agents/profile-builder.ts),
 *     which uses the partner→deal mapping to attribute a partner's
 *     focus area
 *   - the outreach UI's "deals this partner has done" panel
 */

import { sql } from "@/lib/db"
import { generate } from "@/lib/ai/provider"
import { crawlSite, type CrawlSiteResult } from "@/lib/admin/web-crawler"

export interface PortfolioSearchInput {
  firmId?: string
  firmUrl?: string
  /** Cap on pages to crawl. Default 6: home + about + team + portfolio + 2 backups. */
  maxPages?: number
}

export interface PortfolioCompany {
  name: string
  /** Sector if surfaced. */
  sector?: string
  /** Year invested if surfaced. */
  year?: number
  /** "Lead" / "Co-lead" / "Participant" / "Series A" etc., as written. */
  role?: string
  /** Partner / principal who led the deal, if attributed. */
  leadPartner?: string
  /** URL on the firm's site where the deal is listed (for citations). */
  pageUrl?: string
}

export interface TeamMember {
  fullName: string
  title?: string
  /** LinkedIn or email if surfaced. */
  contact?: string
  /** URL on the firm's site where the bio came from. */
  pageUrl?: string
}

export interface PortfolioSearchResult {
  firmId: string | null
  firmUrl: string
  pagesUsed: { url: string; words: number; kind?: string }[]
  team: TeamMember[]
  portfolio: PortfolioCompany[]
  /** Map: partner full name → portfolio company names they led. */
  partnerDeals: Record<string, string[]>
  notes: string[]
  generatedBy: string
  durationMs: number
}

const MAX_TEXT_FOR_AI = 18_000

export async function searchFirmPortfolio(input: PortfolioSearchInput): Promise<PortfolioSearchResult> {
  const t0 = Date.now()
  const notes: string[] = []
  let firmId: string | null = null
  let firmUrl = input.firmUrl?.trim() ?? ""

  if (input.firmId) {
    firmId = input.firmId
    if (!firmUrl) {
      const [row] = await sql`SELECT website FROM investment_firms WHERE id = ${input.firmId} LIMIT 1`
      firmUrl = (row as any)?.website ?? ""
      if (!firmUrl) notes.push("Firm has no website on file.")
    }
  }
  if (!firmUrl) {
    return {
      firmId, firmUrl: "",
      pagesUsed: [], team: [], portfolio: [], partnerDeals: {},
      notes: ["No website / firmUrl provided."],
      generatedBy: "skipped",
      durationMs: Date.now() - t0,
    }
  }

  // Targeted crawl: prioritise team + portfolio
  const crawl = await crawlSite(firmUrl, {
    maxPages: input.maxPages ?? 6,
    concurrency: 3,
    follow: ["team", "portfolio", "thesis", "about"],
  })

  const teamPages = crawl.pages.filter((p) => /team|people|partners|founders|leadership/i.test(p.finalUrl))
  const portfolioPages = crawl.pages.filter((p) => /portfolio|companies|invest(ments|ed)?/i.test(p.finalUrl))

  const team = await extractTeam(teamPages, firmUrl)
  const portfolio = await extractPortfolio(portfolioPages, firmUrl)

  // partnerDeals map: any company whose `leadPartner` matches a team member.
  const partnerNames = new Set(team.map((t) => t.fullName.toLowerCase()))
  const partnerDeals: Record<string, string[]> = {}
  for (const c of portfolio) {
    if (!c.leadPartner) continue
    const key = c.leadPartner.toLowerCase()
    if (!partnerNames.has(key)) continue
    if (!partnerDeals[c.leadPartner]) partnerDeals[c.leadPartner] = []
    partnerDeals[c.leadPartner].push(c.name)
  }

  if (team.length === 0) notes.push("No team page found or model returned no extractable team rows.")
  if (portfolio.length === 0) notes.push("No portfolio page found or no portfolio rows extracted.")

  return {
    firmId,
    firmUrl,
    pagesUsed: crawl.pages.filter((p) => p.text).map((p) => ({ url: p.finalUrl, words: p.wordCount })),
    team,
    portfolio,
    partnerDeals,
    notes,
    generatedBy: "ollama:portfolio_search",
    durationMs: Date.now() - t0,
  }
}

// ─── extractors ────────────────────────────────────────────────────────
async function extractTeam(pages: { finalUrl: string; metadata: any; text: string }[], firmUrl: string): Promise<TeamMember[]> {
  if (pages.length === 0) return []
  const corpus = pages.map((p) => `--- ${p.metadata.title || p.finalUrl} (${p.finalUrl}) ---\n${p.text.slice(0, 12_000)}`).join("\n\n")
  const prompt = `You are extracting team members from a venture firm's TEAM page.

Firm URL: ${firmUrl}

Page text:
"""
${corpus.slice(0, MAX_TEXT_FOR_AI)}
"""

Return ONLY this JSON object — an object with one array key.  Use null/omit when truly unknown.

{
  "team": [
    {
      "fullName": "<First Last>",
      "title": "<Partner / Principal / GP / Founding Partner / Operator-in-Residence / etc.>",
      "contact": "<email or LinkedIn URL if surfaced, else null>",
      "pageUrl": "<which page this came from, copied from the markers above>"
    }
  ]
}

If multiple pages mention the same person, list them once.  No markdown, no commentary.`
  const text = await generate(prompt, { task: "portfolio_search", maxTokens: 1500, temperature: 0.2, json: true })
  const parsed = parseJson(text)
  const arr: any[] = Array.isArray(parsed?.team) ? parsed.team : Array.isArray(parsed) ? parsed : []
  return arr
    .filter((m) => m && typeof m.fullName === "string" && m.fullName.trim())
    .map((m) => ({
      fullName: String(m.fullName).trim(),
      title: typeof m.title === "string" ? m.title.trim() : undefined,
      contact: typeof m.contact === "string" ? m.contact.trim() : undefined,
      pageUrl: typeof m.pageUrl === "string" ? m.pageUrl.trim() : undefined,
    }))
}

async function extractPortfolio(pages: { finalUrl: string; metadata: any; text: string }[], firmUrl: string): Promise<PortfolioCompany[]> {
  if (pages.length === 0) return []
  const corpus = pages.map((p) => `--- ${p.metadata.title || p.finalUrl} (${p.finalUrl}) ---\n${p.text.slice(0, 12_000)}`).join("\n\n")
  const prompt = `You are extracting portfolio companies from a venture firm's PORTFOLIO page(s).

Firm URL: ${firmUrl}

Page text:
"""
${corpus.slice(0, MAX_TEXT_FOR_AI)}
"""

Return ONLY this JSON object:

{
  "portfolio": [
    {
      "name": "<company name>",
      "sector": "<sector tag if surfaced>",
      "year": <year invested if surfaced>,
      "role": "<lead / co-lead / participant / seed / series-a / etc., as written>",
      "leadPartner": "<full name of the partner who led the deal, if attributed>",
      "pageUrl": "<which page this came from>"
    }
  ]
}

Only include companies actually listed as portfolio.  Skip non-portfolio mentions (alumni, friends, news links).  No markdown, no commentary.`
  const text = await generate(prompt, { task: "portfolio_search", maxTokens: 1700, temperature: 0.2, json: true })
  const parsed = parseJson(text)
  const arr: any[] = Array.isArray(parsed?.portfolio) ? parsed.portfolio : Array.isArray(parsed) ? parsed : []
  return arr
    .filter((c) => c && typeof c.name === "string" && c.name.trim())
    .map((c) => ({
      name: String(c.name).trim(),
      sector: typeof c.sector === "string" ? c.sector.trim().toLowerCase() : undefined,
      year: typeof c.year === "number" ? Math.round(c.year) : undefined,
      role: typeof c.role === "string" ? c.role.trim() : undefined,
      leadPartner: typeof c.leadPartner === "string" ? c.leadPartner.trim() : undefined,
      pageUrl: typeof c.pageUrl === "string" ? c.pageUrl.trim() : undefined,
    }))
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

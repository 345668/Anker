/**
 * Public-data-only LinkedIn fetcher.
 *
 * IMPORTANT — LinkedIn's Terms of Service forbid automated scraping
 * even of public pages.  This module is deliberately *minimal*: it
 * only reads what LinkedIn returns to a non-authenticated user-agent
 * (the SEO snippet you see when you open a profile in an incognito
 * window).  Total payload is typically a name, headline, and the
 * first ~200 characters of the about section.
 *
 * No headless browser. No session cookies. No bypass tricks.  When
 * LinkedIn returns its login wall (which is the common case in 2026),
 * we record that fact in `loginWall: true` and return what's
 * extractable from the page metadata only.
 *
 * For richer data the user has two legitimate paths:
 *
 *   (a) The investor's firm site — usually has a team page with bio +
 *       focus areas. Already supported via `lib/admin/web-crawler.ts`.
 *   (b) An authenticated session driven by the user themselves
 *       (e.g. via the Claude-in-Chrome extension while they're
 *       logged in). This module exposes `parseProfileSnippetHtml()`
 *       so a caller that supplies their own HTML can reuse the
 *       extractor without any fetching.
 *
 * Open-source equivalents: `linkedin-jobs-scraper`, `proxycurl-py`,
 * `staffspy`. None bypass ToS; the scraping ones risk an account
 * ban. We chose the boring legitimate approach.
 */

import { fetchPage, extractMetadata, extractText } from "@/lib/admin/web-crawler"
import { generate } from "@/lib/ai/provider"

const USER_AGENT_BOT =
  "Mozilla/5.0 (compatible; AnkerProfileFetcher/1.0; +https://anker.ai/bot)"

export interface LinkedInPublicSnippet {
  url: string
  finalUrl: string
  /** True if LinkedIn served the login-wall page (no useful profile content). */
  loginWall: boolean
  /** True if the URL was reachable and returned 200. */
  ok: boolean
  status: number
  /** From <title>, OG, or visible H1 — typical: "First Last - Title - Firm". */
  displayLabel: string | null
  fullName: string | null
  headline: string | null
  /** SEO description from the page. */
  description: string | null
  /** Visible body text (when not behind the login wall). */
  bodyText: string | null
  /** Whatever extra fields the AI extractor pulled from the snippet. */
  extracted: LinkedInExtractedFields
  fetchedAt: string
  notes: string[]
}

export interface LinkedInExtractedFields {
  fullName?: string
  title?: string
  firm?: string
  location?: string
  /** 1-2 sentence summary if surfaced. */
  summary?: string
  /** Any school / past-firm signals if visible. */
  pastFirms?: string[]
  /** Confidence 0..1. */
  confidence?: number
}

const LOGIN_WALL_MARKERS = [
  "Sign in", "Join now", "Sign Up", "Authwall", "authwall",
  "to view this profile", "Continue with email", "linkedin.com/login",
  "Sign in to LinkedIn", "Join LinkedIn",
]

/** Fetch a LinkedIn profile URL and return the (likely sparse) public
 *  snippet.  Honours robots.txt-style etiquette: 1 request, 12 s
 *  timeout, identifying user-agent. */
export async function fetchLinkedInPublic(
  url: string,
): Promise<LinkedInPublicSnippet> {
  const fetchedAt = new Date().toISOString()
  if (!isLinkedInUrl(url)) {
    return baseSnippet(url, url, fetchedAt, false, 0, "Not a LinkedIn URL.")
  }
  const fp = await fetchPage(url, { userAgent: USER_AGENT_BOT, timeoutMs: 12_000 })
  if (!fp.ok) {
    return baseSnippet(url, fp.finalUrl, fetchedAt, false, fp.status, fp.error ?? `status ${fp.status}`)
  }
  return parseProfileSnippetHtml(fp.html, fp.url, fp.finalUrl, fp.status, fetchedAt)
}

/** Public for callers that supply their own HTML (e.g. an authenticated
 *  session piped in from a browser extension). */
export async function parseProfileSnippetHtml(
  html: string,
  url: string,
  finalUrl: string,
  status: number,
  fetchedAt = new Date().toISOString(),
): Promise<LinkedInPublicSnippet> {
  const meta = extractMetadata(html, finalUrl)
  const text = extractText(html)
  const loginWall = LOGIN_WALL_MARKERS.some((m) => html.includes(m)) || /linkedin\.com\/(login|authwall)/i.test(finalUrl)

  // Headline / display-label parsing:  LinkedIn's <title> is usually
  // "First Last - Headline - Firm | LinkedIn" for public profiles.
  const titleStr = meta.title ?? meta.ogTitle ?? null
  const { fullName, headlineFromTitle, firmFromTitle } = parseTitle(titleStr)

  const description = meta.metaDescription ?? meta.ogDescription ?? null
  const displayLabel = titleStr?.replace(/\s*\|?\s*LinkedIn\s*$/i, "").trim() || null

  const notes: string[] = []
  if (loginWall) notes.push("LinkedIn served the login wall — only metadata is available.")
  if (!description && !text) notes.push("No useful body content extracted.")

  const fullSnippet = [titleStr, description, text].filter(Boolean).join("\n\n").slice(0, 4000)
  const extracted = await extractFieldsWithAI({
    snippet: fullSnippet,
    fallbackName: fullName ?? undefined,
    fallbackHeadline: headlineFromTitle ?? undefined,
    fallbackFirm: firmFromTitle ?? undefined,
  })

  return {
    url,
    finalUrl,
    loginWall,
    ok: status >= 200 && status < 400,
    status,
    displayLabel,
    fullName,
    headline: headlineFromTitle,
    description,
    bodyText: loginWall ? null : (text || null),
    extracted,
    fetchedAt,
    notes,
  }
}

// ─── helpers ───────────────────────────────────────────────────────────
export function isLinkedInUrl(u: string): boolean {
  try {
    const host = new URL(u).hostname.toLowerCase()
    return host === "linkedin.com" || host.endsWith(".linkedin.com")
  } catch { return false }
}

function baseSnippet(
  url: string, finalUrl: string, fetchedAt: string,
  ok: boolean, status: number, reason: string,
): LinkedInPublicSnippet {
  return {
    url, finalUrl, loginWall: false, ok, status,
    displayLabel: null, fullName: null, headline: null,
    description: null, bodyText: null,
    extracted: { confidence: 0 },
    fetchedAt,
    notes: [reason],
  }
}

/** Tease a name / headline / firm out of a typical LinkedIn page title.
 *  Examples seen in the wild:
 *    "Jane Doe - Partner - Acme Ventures | LinkedIn"
 *    "John Smith on LinkedIn: Building seed-stage…"
 *    "Jane Doe - LinkedIn"
 */
function parseTitle(title: string | null): {
  fullName: string | null
  headlineFromTitle: string | null
  firmFromTitle: string | null
} {
  if (!title) return { fullName: null, headlineFromTitle: null, firmFromTitle: null }
  const stripped = title.replace(/\s*\|?\s*LinkedIn\s*$/i, "").trim()
  // Pattern A: "Name - Headline - Firm"
  const dashSplit = stripped.split(/\s+-\s+/)
  if (dashSplit.length >= 3) {
    return {
      fullName: dashSplit[0]?.trim() || null,
      headlineFromTitle: dashSplit[1]?.trim() || null,
      firmFromTitle: dashSplit.slice(2).join(" - ").trim() || null,
    }
  }
  // Pattern B: "Name - Firm"
  if (dashSplit.length === 2) {
    return {
      fullName: dashSplit[0]?.trim() || null,
      headlineFromTitle: null,
      firmFromTitle: dashSplit[1]?.trim() || null,
    }
  }
  // Pattern C: "Name on LinkedIn: …"
  const onMatch = stripped.match(/^(.+?)\s+on\s+LinkedIn[: ]/i)
  if (onMatch) {
    return {
      fullName: onMatch[1].trim(),
      headlineFromTitle: null,
      firmFromTitle: null,
    }
  }
  return { fullName: stripped || null, headlineFromTitle: null, firmFromTitle: null }
}

/** Use the local AI's balanced tier to fill any gaps the regex couldn't. */
async function extractFieldsWithAI(args: {
  snippet: string
  fallbackName?: string
  fallbackHeadline?: string
  fallbackFirm?: string
}): Promise<LinkedInExtractedFields> {
  if (!args.snippet || args.snippet.length < 30) {
    return mergeFallbacks({}, args)
  }
  const prompt = `You are extracting fields from a LinkedIn profile snippet (likely sparse — the page may have shown only the SEO description).  Use null/omit when truly unknown — do NOT invent.

Snippet:
"""
${args.snippet}
"""

Hints from URL/title (use only if the snippet doesn't contradict):
- Name hint: ${args.fallbackName ?? "—"}
- Headline hint: ${args.fallbackHeadline ?? "—"}
- Firm hint: ${args.fallbackFirm ?? "—"}

Return ONLY this JSON object:
{
  "fullName": "<First Last>",
  "title": "<Partner / Principal / GP / Operator / etc.>",
  "firm": "<firm name>",
  "location": "<city, state, country>",
  "summary": "<1-2 sentence professional summary if surfaced>",
  "pastFirms": ["<prior employers if mentioned>"],
  "confidence": <0..1>
}

No markdown, no commentary.`
  const text = await generate(prompt, { task: "linkedin_extract", maxTokens: 500, temperature: 0.2, json: true })
  const parsed = parseJson(text)
  return mergeFallbacks(parsed ? normalize(parsed) : {}, args)
}

function mergeFallbacks(extracted: LinkedInExtractedFields, args: { fallbackName?: string; fallbackHeadline?: string; fallbackFirm?: string }): LinkedInExtractedFields {
  const out: LinkedInExtractedFields = { ...extracted }
  if (!out.fullName && args.fallbackName) out.fullName = args.fallbackName
  if (!out.title && args.fallbackHeadline) out.title = args.fallbackHeadline
  if (!out.firm && args.fallbackFirm) out.firm = args.fallbackFirm
  if (out.confidence == null) out.confidence = 0.3
  return out
}

function normalize(raw: any): LinkedInExtractedFields {
  const out: LinkedInExtractedFields = {}
  if (typeof raw.fullName === "string") out.fullName = raw.fullName.trim()
  if (typeof raw.title === "string") out.title = raw.title.trim()
  if (typeof raw.firm === "string") out.firm = raw.firm.trim()
  if (typeof raw.location === "string") out.location = raw.location.trim()
  if (typeof raw.summary === "string") out.summary = raw.summary.trim()
  if (Array.isArray(raw.pastFirms)) out.pastFirms = raw.pastFirms.filter((s: any) => typeof s === "string").slice(0, 8)
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

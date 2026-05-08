/**
 * Deep research — produce a multi-paragraph dossier on a firm.
 *
 * Inputs:
 *   - `target`: a URL OR a free-text seed (firm name + optional context).
 *
 * Pipeline:
 *   1. Resolve a starting URL.  If only a name was given, use a quick
 *      heuristic guess (`https://<slug>.com` / `.vc` / `.io`) and let
 *      the user override.  We don't call out to a search engine.
 *   2. Crawl up to 8 pages: home + about + team + portfolio + thesis +
 *      recent blog post (if any).
 *   3. AI step (`deep_research` task → DEEP tier model) synthesizes a
 *      dossier with sections:
 *        - One-liner
 *        - Investment thesis (2-3 paragraphs, citing pages)
 *        - Sectors / stages / geo / check-size signals (bulleted)
 *        - Notable portfolio (with the page each was found on)
 *        - Team (named partners + 1-line bios when stated)
 *        - Recent activity (blog or news, if present)
 *        - Open questions (what's NOT in the public site that an LP /
 *          founder would still want)
 *
 * The dossier is a Markdown string — the UI can render it directly,
 * the API can ship it as a docx via `markdownToDocxBuffer`.
 */

import { generate } from "@/lib/ai/provider"
import {
  crawlSite,
  type CrawlSiteResult,
  type PageLinkKind,
} from "./web-crawler"
import { findFirmHomepage, isSearxngAvailable } from "@/lib/agents/web-search"

export interface DeepResearchInput {
  /** Either a URL or a free-text seed (e.g. "Acme Ventures"). */
  target: string
  /** When `target` is a name, optional location / sector hints help
   *  the model disambiguate. Free text. */
  hints?: string
  /** Max pages to crawl. Default 8. */
  maxPages?: number
  /** Override the page kinds we follow.  Default: about, team,
   *  portfolio, thesis, blog. */
  follow?: PageLinkKind[]
}

export interface DeepResearchResult {
  startedAt: string
  finishedAt: string
  durationMs: number
  seedTarget: string
  resolvedUrl: string
  /** Dossier in Markdown. */
  dossierMarkdown: string
  /** Pages we ended up using for context. */
  pagesUsed: { url: string; title: string | null; words: number; kind?: PageLinkKind }[]
  errors: { url: string; error: string }[]
  generatedBy: string
  notes?: string
}

const DEFAULT_FOLLOW: PageLinkKind[] = ["about", "team", "portfolio", "thesis", "blog"]
const MAX_AI_CHARS = 22_000

export async function deepResearch(input: DeepResearchInput): Promise<DeepResearchResult> {
  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const seedTarget = (input.target || "").trim()
  if (!seedTarget) throw new Error("target required (URL or firm name)")

  // Resolve URL — try SearXNG first when available, else fall back to
  // the slug-guessing heuristic.
  let resolvedUrl: string
  if (looksLikeUrl(seedTarget)) {
    resolvedUrl = seedTarget
  } else {
    const found = (await isSearxngAvailable())
      ? await findFirmHomepage(seedTarget).catch(() => null)
      : null
    resolvedUrl = found ?? guessUrlFromName(seedTarget)
  }

  const crawl = await crawlSite(resolvedUrl, {
    maxPages: input.maxPages ?? 8,
    concurrency: 3,
    follow: input.follow ?? DEFAULT_FOLLOW,
  })
  const corpus = buildResearchCorpus(crawl)
  if (!corpus) {
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      seedTarget,
      resolvedUrl,
      dossierMarkdown: stubDossier(seedTarget, resolvedUrl, crawl, "site returned no extractable text"),
      pagesUsed: [],
      errors: crawl.errors,
      generatedBy: "skipped",
      notes: "Site looks JS-rendered or unreachable. Try a different URL or paste content directly.",
    }
  }

  const dossier = await synthesize(seedTarget, resolvedUrl, corpus, input.hints)
  const generatedBy = (dossier as any)._generatedBy ?? "heuristic"
  const md = (dossier as any).markdown as string

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    seedTarget,
    resolvedUrl,
    dossierMarkdown: md,
    pagesUsed: crawl.pages
      .filter((p) => p.text)
      .map((p) => ({ url: p.finalUrl, title: p.metadata.title ?? null, words: p.wordCount })),
    errors: crawl.errors,
    generatedBy,
  }
}

// ─── prompt + synthesis ────────────────────────────────────────────────
async function synthesize(
  seedTarget: string,
  resolvedUrl: string,
  corpus: string,
  hints?: string,
): Promise<{ markdown: string; _generatedBy: string }> {
  const prompt = `You are a senior LP / founder research analyst writing a dossier on a venture firm based ONLY on the website pages provided.  Do not invent facts that aren't on the pages.  Cite the page (URL) each claim came from in parentheses.

Subject: ${seedTarget}
Resolved URL: ${resolvedUrl}
${hints ? `Hints: ${hints}` : ""}

PAGES (joined, with markers):
"""
${corpus.slice(0, MAX_AI_CHARS)}
"""

Write a Markdown dossier with these exact sections, in this order:

# {{Firm name}}

## One-liner
A single sentence on what they invest in and at what stage.

## Investment thesis
Two to three short paragraphs.  Cite (URL) where each claim came from.

## Sectors, stages, geographies
Bullet list, lowercase tags where possible.  Pull check-size language as quoted phrases.

## Notable portfolio
Bullet list of company names found on the site.  Cite (URL) per company.

## Team
Bullet list of named partners with 1-line bios when stated.

## Recent activity
Latest blog post(s) or press, if visible.  Otherwise "Not surfaced on the public site."

## Open questions for outreach
Three to five bullets — what's NOT on the public site that a founder
or LP would still want before a first call.

End with a line: "_Generated from ${seedTarget} (${resolvedUrl}) on $(date)_"

Output ONLY the Markdown dossier.  No JSON, no fences.`

  const text = await generate(prompt, { task: "deep_research", maxTokens: 1800, temperature: 0.4, json: false })
  if (!text || text.length < 80) {
    return {
      markdown: stubDossier(seedTarget, resolvedUrl, null, "AI step returned too little content"),
      _generatedBy: "heuristic",
    }
  }
  return { markdown: text.trim(), _generatedBy: "ollama:deep_research" }
}

// ─── helpers ───────────────────────────────────────────────────────────
function buildResearchCorpus(c: CrawlSiteResult): string {
  const parts: string[] = []
  for (const p of c.pages) {
    if (!p.text) continue
    parts.push(`--- ${p.metadata.title || p.finalUrl} (${p.finalUrl}) ---\n${p.text.slice(0, 14_000)}`)
  }
  return parts.join("\n\n").trim()
}

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}/i.test(s)
}

function guessUrlFromName(name: string): string {
  // "Acme Ventures Capital" → "acme.com" / "acmeventures.com" — return
  // the longer slug; the UI surfaces the resolved URL so the user can
  // override before re-running.
  const slug = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(ventures|venture|capital|partners|fund|funds|llp|llc|inc|co|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32)
  return `https://${slug || "www"}.com`
}

function stubDossier(seedTarget: string, resolvedUrl: string, crawl: CrawlSiteResult | null, why: string): string {
  return `# ${seedTarget}

## One-liner
Could not produce a dossier from ${resolvedUrl} — ${why}.

## What was tried
- Resolved URL: ${resolvedUrl}
- Pages crawled: ${crawl?.pages.length ?? 0}
- Errors: ${(crawl?.errors ?? []).map((e) => `${e.url} (${e.error})`).join(", ") || "—"}

## Suggested next steps
- Try a more specific URL (e.g. add "/about" or paste the LinkedIn page).
- If the site is fully JS-rendered, paste the page text directly into the manual extraction tool.
- Confirm the firm exists at this domain — the URL was guessed from the name.
`
}

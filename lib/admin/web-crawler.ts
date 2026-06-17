/**
 * Lightweight web crawler for the admin tools.
 *
 * No headless browser — `fetch()` + a small HTML extractor only.  This
 * keeps memory tiny and avoids shipping Chromium with the app.  The
 * tradeoff is that JS-only sites (Webflow apps, fully-client-rendered
 * pages) return very little useful text; we set `imageHeavy=true` /
 * `mostlyEmpty=true` flags so the AI step can degrade gracefully.
 *
 * Pipeline:
 *   fetchPage(url)
 *     → status, finalUrl (after redirects), html
 *   extractClean(html, baseUrl)
 *     → title, meta description, og:* tags, visible text, links
 *   classifyLink(link, baseDomain)
 *     → "homepage" | "about" | "team" | "portfolio" | "blog" | ...
 *
 * `crawlSite(seedUrl, opts)` is a depth-limited multi-page crawler that
 * fetches the homepage + the highest-priority internal pages (about,
 * team, portfolio) and returns a single CrawlResult bundle the AI step
 * can consume.
 */

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; AnkerResearchBot/1.0; +https://anker.ai/bot)"
const DEFAULT_TIMEOUT_MS = 12_000
const MAX_HTML_BYTES = 1_500_000 // 1.5 MB ceiling per page
const MAX_TEXT_CHARS = 60_000

export interface FetchPageResult {
  url: string                  // requested URL
  finalUrl: string             // after redirects
  status: number
  ok: boolean
  contentType: string | null
  html: string                 // capped to MAX_HTML_BYTES
  fetchedAt: string            // ISO
  error: string | null
  redirected: boolean
  /** Bytes of HTML actually received (pre-truncation). */
  bytes: number
}

export interface PageMetadata {
  title: string | null
  metaDescription: string | null
  ogTitle: string | null
  ogDescription: string | null
  ogImage: string | null
  canonicalUrl: string | null
  language: string | null
}

export interface PageLink {
  href: string                  // absolute URL
  rawHref: string               // as-written
  text: string                  // anchor text (trimmed)
  rel: string | null
  /** Same-domain heuristic. */
  internal: boolean
  /** AI-friendly bucket — see classifyLink(). */
  kind: PageLinkKind
}

export type PageLinkKind =
  | "homepage"
  | "about"
  | "team"
  | "portfolio"
  | "investments"
  | "thesis"
  | "blog"
  | "press"
  | "careers"
  | "contact"
  | "legal"
  | "social"
  | "external"
  | "other"

export interface CleanedPage {
  url: string
  finalUrl: string
  status: number
  ok: boolean
  fetchedAt: string
  metadata: PageMetadata
  /** Full visible-text content, whitespace-collapsed, capped. */
  text: string
  /** Word count of `text` — useful for "mostly empty" detection. */
  wordCount: number
  links: PageLink[]
  imageHeavy: boolean           // very low text + many <img> tags
  mostlyEmpty: boolean          // wordCount < 60
  bytes: number
  error: string | null
}

// ─── fetch with timeout + redirect tracking ───────────────────────────────
export async function fetchPage(url: string, opts: { userAgent?: string; timeoutMs?: number } = {}): Promise<FetchPageResult> {
  const startedAt = new Date().toISOString()
  let normalized = url.trim()
  if (!normalized) {
    return makeError(url, normalized, "empty url", startedAt)
  }
  if (!/^https?:\/\//i.test(normalized)) normalized = "https://" + normalized

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(normalized, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": opts.userAgent ?? DEFAULT_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: ctrl.signal,
    })
    const contentType = res.headers.get("content-type")
    const reader = res.body?.getReader()
    let bytes = 0
    let html = ""
    if (reader) {
      const decoder = new TextDecoder("utf-8", { fatal: false })
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes <= MAX_HTML_BYTES) {
          html += decoder.decode(value, { stream: true })
        }
        if (bytes >= MAX_HTML_BYTES * 1.2) {
          // hard-stop reads beyond cap
          await reader.cancel()
          break
        }
      }
      html += decoder.decode()
    }
    return {
      url: normalized,
      finalUrl: res.url,
      status: res.status,
      ok: res.ok,
      contentType,
      html,
      fetchedAt: startedAt,
      error: null,
      redirected: res.redirected,
      bytes,
    }
  } catch (e: any) {
    return makeError(url, normalized, e?.message ?? "fetch failed", startedAt)
  } finally {
    clearTimeout(timer)
  }
}

function makeError(url: string, normalized: string, msg: string, fetchedAt: string): FetchPageResult {
  return {
    url, finalUrl: normalized, status: 0, ok: false,
    contentType: null, html: "", fetchedAt,
    error: msg, redirected: false, bytes: 0,
  }
}

// ─── HTML → cleaned page ─────────────────────────────────────────────────
export function extractClean(fp: FetchPageResult): CleanedPage {
  const baseUrl = fp.finalUrl || fp.url
  if (!fp.ok || !fp.html) {
    return {
      url: fp.url,
      finalUrl: baseUrl,
      status: fp.status,
      ok: fp.ok,
      fetchedAt: fp.fetchedAt,
      metadata: emptyMeta(),
      text: "",
      wordCount: 0,
      links: [],
      imageHeavy: false,
      mostlyEmpty: true,
      bytes: fp.bytes,
      error: fp.error,
    }
  }
  const html = fp.html
  const metadata = extractMetadata(html, baseUrl)
  const text = extractText(html, baseUrl)
  const links = extractLinks(html, baseUrl)
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0
  const imgCount = (html.match(/<img\b/gi) || []).length
  return {
    url: fp.url,
    finalUrl: baseUrl,
    status: fp.status,
    ok: fp.ok,
    fetchedAt: fp.fetchedAt,
    metadata,
    text,
    wordCount,
    links,
    imageHeavy: wordCount < 200 && imgCount > 8,
    mostlyEmpty: wordCount < 60,
    bytes: fp.bytes,
    error: null,
  }
}

function emptyMeta(): PageMetadata {
  return {
    title: null,
    metaDescription: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    canonicalUrl: null,
    language: null,
  }
}

export function extractMetadata(html: string, baseUrl: string): PageMetadata {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? decode(titleMatch[1]).replace(/\s+/g, " ").trim() : null
  const langMatch = html.match(/<html[^>]*\blang=["']([a-zA-Z-]+)["']/i)
  const ogTitle = pickMeta(html, "og:title")
  const ogDescription = pickMeta(html, "og:description")
  const ogImage = absolutize(pickMeta(html, "og:image"), baseUrl)
  const description = pickMeta(html, "description") ?? pickMeta(html, "Description")
  const canonical = pickLink(html, "canonical")
  return {
    title,
    metaDescription: description,
    ogTitle,
    ogDescription,
    ogImage,
    canonicalUrl: absolutize(canonical, baseUrl),
    language: langMatch ? langMatch[1].toLowerCase() : null,
  }
}

function pickMeta(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]*\\b(?:name|property)\\s*=\\s*["']${escapeRe(name)}["'][^>]*\\bcontent\\s*=\\s*["']([^"']*)["']`,
    "i",
  )
  const re2 = new RegExp(
    `<meta[^>]*\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*\\b(?:name|property)\\s*=\\s*["']${escapeRe(name)}["']`,
    "i",
  )
  const m = html.match(re) || html.match(re2)
  return m ? decode(m[1]).trim() : null
}

function pickLink(html: string, rel: string): string | null {
  const re = new RegExp(
    `<link[^>]*\\brel\\s*=\\s*["']${escapeRe(rel)}["'][^>]*\\bhref\\s*=\\s*["']([^"']*)["']`,
    "i",
  )
  const re2 = new RegExp(
    `<link[^>]*\\bhref\\s*=\\s*["']([^"']*)["'][^>]*\\brel\\s*=\\s*["']${escapeRe(rel)}["']`,
    "i",
  )
  const m = html.match(re) || html.match(re2)
  return m ? decode(m[1]).trim() : null
}

function escapeRe(s: string): string {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
}

/**
 * Extract clean readable text from HTML.
 *
 * First-pass: try Readability (Mozilla's reader-mode extractor) — it
 * yields `article`-grade text on most editorial sites, including
 * VC blogs, About pages, and portfolio detail pages.
 *
 * Fallback: the regex stripper below.  Used when Readability declines
 * (some pages don't have an article-shaped DOM).
 */
export function extractText(html: string, baseUrl?: string): string {
  // Try Readability path. We do this synchronously inside the
  // `extractClean` flow; jsdom is hard-loaded since we ship it as a
  // dependency, but we still wrap in try/catch so a broken page
  // doesn't take the whole crawl down.
  try {
    const readable = readabilityExtract(html, baseUrl ?? "")
    if (readable && readable.length >= 80) {
      return cap(readable)
    }
  } catch {
    // fall through to regex stripper
  }
  // Fallback: deterministic regex pipeline.
  let s = html
  s = s.replace(/<!--[\s\S]*?-->/g, " ")
  s = s.replace(/<(script|style|svg|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
  s = s.replace(/<br\s*\/?>(?!\s*<)/gi, "\n")
  s = s.replace(/<\/(p|div|li|h[1-6]|tr|td|th|section|article|header|footer|main|nav|aside)>/gi, "\n")
  s = s.replace(/<[^>]+>/g, " ")
  s = decode(s)
  s = s.replace(/[ \t\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  return cap(s)
}

function cap(s: string): string {
  if (s.length > MAX_TEXT_CHARS) return s.slice(0, MAX_TEXT_CHARS) + "\n…[truncated]"
  return s
}

/** Lazy-loaded Readability path. Cached at module level. */
let _readabilityModule: typeof import("@mozilla/readability") | null = null
let _jsdomModule: typeof import("jsdom") | null = null

function readabilityExtract(html: string, url: string): string | null {
  if (!_readabilityModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _readabilityModule = require("@mozilla/readability")
  }
  if (!_jsdomModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _jsdomModule = require("jsdom")
  }
  if (!_readabilityModule || !_jsdomModule) return null
  const { JSDOM } = _jsdomModule
  // Quick check — Readability needs at least a <body> tag.
  if (!/<body\b/i.test(html)) return null
  const dom = new JSDOM(html, { url: url || "https://anker.local/" })
  const reader = new _readabilityModule.Readability(dom.window.document, {
    // Be a bit more aggressive on short content (about pages, team pages).
    charThreshold: 200,
  })
  const parsed = reader.parse()
  if (!parsed?.textContent) return null
  return parsed.textContent.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'",
  "&nbsp;": " ", "&apos;": "'", "&hellip;": "…", "&mdash;": "—", "&ndash;": "–",
}
function decode(s: string): string {
  return s
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp|apos|hellip|mdash|ndash);/g, (m) => ENTITY_MAP[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}

export function extractLinks(html: string, baseUrl: string): PageLink[] {
  const out: PageLink[] = []
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  const seen = new Set<string>()
  const baseDomain = safeHostname(baseUrl)
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1]
    const inner = m[2]
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']*)["']/i)
    if (!hrefMatch) continue
    const rawHref = hrefMatch[1].trim()
    if (!rawHref || rawHref.startsWith("#") || /^(javascript|mailto|tel):/i.test(rawHref)) continue
    const abs = absolutize(rawHref, baseUrl)
    if (!abs) continue
    if (seen.has(abs)) continue
    seen.add(abs)
    const relMatch = attrs.match(/\brel\s*=\s*["']([^"']*)["']/i)
    const text = decode(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 200)
    const internal = baseDomain != null && safeHostname(abs) === baseDomain
    out.push({
      href: abs,
      rawHref,
      text,
      rel: relMatch ? relMatch[1] : null,
      internal,
      kind: classifyLink(abs, text, baseDomain),
    })
  }
  return out
}

function safeHostname(u: string): string | null {
  try { return new URL(u).hostname.toLowerCase() } catch { return null }
}

function absolutize(href: string | null | undefined, baseUrl: string): string | null {
  if (!href) return null
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return null
  }
}

/** Heuristic page-type classifier — used to prioritize which links to
 *  follow during multi-page crawling. */
export function classifyLink(href: string, text: string, baseDomain: string | null): PageLinkKind {
  const t = text.toLowerCase().trim()
  const url = href.toLowerCase()
  const path = (() => { try { return new URL(href).pathname.toLowerCase() } catch { return url } })()
  const host = safeHostname(href) ?? ""

  if (baseDomain && host && host !== baseDomain) {
    if (/linkedin\.com|twitter\.com|x\.com|github\.com|facebook\.com|instagram\.com|youtube\.com|crunchbase\.com/i.test(host))
      return "social"
    return "external"
  }
  // Same-domain
  if (path === "/" || path === "" || path === "/index.html") return "homepage"
  if (/about|company|story|who-we-are/.test(path) || /^about/.test(t)) return "about"
  if (/team|people|partners|founders|leadership/.test(path) || /\bteam|people|partners|founders\b/.test(t)) return "team"
  if (/portfolio|companies|invest(ments|ed)?/.test(path) || /\bportfolio|companies\b/.test(t)) return "portfolio"
  if (/thesis|approach|strategy|focus/.test(path) || /\bthesis|approach|strategy\b/.test(t)) return "thesis"
  if (/blog|writing|insights|essays|articles|news/.test(path)) return "blog"
  if (/press|media/.test(path)) return "press"
  if (/career|jobs|hiring/.test(path)) return "careers"
  if (/contact|email|reach/.test(path)) return "contact"
  if (/(privacy|terms|legal|imprint|cookie)/.test(path)) return "legal"
  return "other"
}

/** Convenience: fetch + clean in one call. */
export async function crawl(url: string, opts: { userAgent?: string; timeoutMs?: number } = {}): Promise<CleanedPage> {
  const fp = await fetchPage(url, opts)
  return extractClean(fp)
}

// ─── multi-page crawler ──────────────────────────────────────────────────
export interface CrawlSiteOptions {
  /** Maximum number of pages to fetch from the seed domain. Default 5. */
  maxPages?: number
  /** Concurrency for parallel fetches. Default 3. */
  concurrency?: number
  /** Per-page fetch timeout. Default 12 s. */
  timeoutMs?: number
  /** Page kinds to follow, in priority order.  Default: about, team,
   *  portfolio, thesis. */
  follow?: PageLinkKind[]
  userAgent?: string
}

export interface CrawlSiteResult {
  seed: string
  startedAt: string
  finishedAt: string
  pages: CleanedPage[]
  /** All same-domain links discovered. Useful for showing the user
   *  what's available without crawling everything. */
  internalLinks: PageLink[]
  errors: { url: string; error: string }[]
}

const DEFAULT_FOLLOW: PageLinkKind[] = ["about", "team", "portfolio", "thesis"]

export async function crawlSite(seedUrl: string, opts: CrawlSiteOptions = {}): Promise<CrawlSiteResult> {
  const startedAt = new Date().toISOString()
  const maxPages = Math.max(1, Math.min(15, opts.maxPages ?? 5))
  const concurrency = Math.max(1, Math.min(6, opts.concurrency ?? 3))
  const follow = opts.follow ?? DEFAULT_FOLLOW
  const errors: { url: string; error: string }[] = []
  const pages: CleanedPage[] = []
  const seen = new Set<string>()

  const seed = await crawl(seedUrl, { timeoutMs: opts.timeoutMs, userAgent: opts.userAgent })
  if (!seed.ok && seed.error) errors.push({ url: seedUrl, error: seed.error ?? `status ${seed.status}` })
  pages.push(seed)
  seen.add(seed.finalUrl)

  const baseDomain = safeHostname(seed.finalUrl)
  const internal = seed.links.filter((l) => l.internal)

  // Pick highest-priority pages we haven't already seen
  const queue: PageLink[] = []
  for (const k of follow) {
    for (const l of internal) if (l.kind === k && !seen.has(l.href)) queue.push(l)
  }
  // Cap to the budget after the seed
  const toFetch = queue.slice(0, maxPages - 1)

  // Fetch with bounded concurrency
  let cursor = 0
  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= toFetch.length) return
      const link = toFetch[i]
      if (seen.has(link.href)) continue
      seen.add(link.href)
      try {
        const c = await crawl(link.href, { timeoutMs: opts.timeoutMs, userAgent: opts.userAgent })
        pages.push(c)
        if (!c.ok && c.error) errors.push({ url: link.href, error: c.error ?? `status ${c.status}` })
      } catch (e: any) {
        errors.push({ url: link.href, error: e?.message ?? "crawl failed" })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, toFetch.length || 1) }, worker))

  return {
    seed: seedUrl,
    startedAt,
    finishedAt: new Date().toISOString(),
    pages,
    internalLinks: internal,
    errors,
  }
}

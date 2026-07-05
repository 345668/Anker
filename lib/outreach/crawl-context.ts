/**
 * Per-profile crawl context for the FO enrichment + outreach tools.
 *
 * Thin wrapper around lib/admin/web-crawler.ts crawlSite(). One call per
 * profile, returns the structured context the LLM prompts need PLUS the
 * raw output columns the SVS_Fund_II_Enriched_Outreach_282 file had
 * (Inferred Website, Crawl Status, Website Title, Meta Description,
 * Investment Focus extracted, Other Emails on Site, Crawl Paths Tried).
 *
 * Why this exists separately from enrichFirm():
 *   - enrichFirm operates on a DB row and mutates the DB.
 *   - The assistant tools operate on uploaded XLSX rows that may or may
 *     not be in the DB. They need the same crawl output without DB
 *     ownership and with deterministic XLSX-ready strings.
 */
import { crawlSite, type CleanedPage } from "@/lib/admin/web-crawler";

export type CrawlStatus = "ok" | "no-url" | "blocked" | "empty" | "timeout" | "error";

export interface ProfileCrawlContext {
  inferredWebsite: string | null;
  crawlStatus: CrawlStatus;
  websiteTitle: string | null;
  metaDescription: string | null;
  /** First 3 thesis-style sentences joined with " — ", or null. */
  investmentFocus: string | null;
  /** Up to 5 distinct emails found anywhere on the crawled pages. */
  otherEmailsOnSite: string[];
  /** Pathnames of the pages actually fetched. */
  crawlPathsTried: string[];
  /** Up to 12,000 chars of cleaned text suitable for an LLM prompt block. */
  corpus: string;
  /** Diagnostic - included so callers can log without re-running. */
  error?: string;
}

const PRIORITY_KINDS = ["homepage", "about", "team", "thesis", "portfolio"] as const;
const FOCUS_TRIGGER = /\b(invest|focus|portfolio|sector|stage|mandate|thesis)\b/i;
const EMAIL_RE = /[\w.+\-]+@[\w\-]+\.[\w.\-]+/g;
const CORPUS_CAP = 12_000;
const FOCUS_CAP = 600;

function safeUrl(u: string): string | null {
  if (!u) return null;
  try {
    const n = new URL(/^https?:\/\//i.test(u) ? u : "https://" + u);
    return n.origin + n.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function pathnameOf(u: string): string {
  try { return new URL(u).pathname || "/"; } catch { return u; }
}

function looksBlocked(p: CleanedPage): boolean {
  const t = (p.text || "").toLowerCase();
  return t.includes("checking your browser")
      || t.includes("cf-mitigation")
      || t.includes("attention required")
      || (p.status === 403);
}

export async function crawlForProfile(args: {
  explicitWebsite?: string | null;
  emailDomain?: string | null;
  firmName?: string | null;
  maxPages?: number;
  timeoutMs?: number;
}): Promise<ProfileCrawlContext> {
  const seed = safeUrl((args.explicitWebsite ?? "").trim())
    || (args.emailDomain ? safeUrl(args.emailDomain) : null);

  const empty = (status: CrawlStatus, error?: string): ProfileCrawlContext => ({
    inferredWebsite: seed,
    crawlStatus: status,
    websiteTitle: null,
    metaDescription: null,
    investmentFocus: null,
    otherEmailsOnSite: [],
    crawlPathsTried: [],
    corpus: "",
    error,
  });

  if (!seed) return empty("no-url");

  let result;
  try {
    result = await crawlSite(seed, {
      maxPages: Math.min(Math.max(args.maxPages ?? 4, 1), 8),
      concurrency: 1, // outer caller parallelises rows; we stay polite per site
      timeoutMs: args.timeoutMs ?? 10_000,
    });
  } catch (e: any) {
    return empty("error", e?.message ?? "crawl failed");
  }

  const pages = (result.pages || []).filter((p) => !!p);
  if (!pages.length) return empty("empty");
  if (pages.every((p) => looksBlocked(p))) return empty("blocked");
  if (pages.every((p) => p.mostlyEmpty)) return empty("empty");

  // Priority-ordered concat - homepage first, then about/team/thesis/portfolio.
  // Pages from the seed (without a classified link) end up under homepage.
  function priority(p: CleanedPage): number {
    const path = pathnameOf(p.finalUrl).toLowerCase();
    if (path === "/" || path === "") return 0;
    if (/(about|company|who)/.test(path)) return 1;
    if (/(team|people|leadership|partners?)/.test(path)) return 2;
    if (/(thesis|approach|strategy|philosophy)/.test(path)) return 3;
    if (/(portfolio|investments?)/.test(path)) return 4;
    return 5;
  }
  const sorted = [...pages].sort((a, b) => priority(a) - priority(b));

  // Build corpus, capped.
  const parts: string[] = [];
  let used = 0;
  for (const p of sorted) {
    if (!p.text) continue;
    const remaining = CORPUS_CAP - used;
    if (remaining <= 100) break;
    const slice = p.text.slice(0, remaining);
    parts.push(slice);
    used += slice.length + 2; // newline accounting
  }
  const corpus = parts.join("\n\n").slice(0, CORPUS_CAP);

  // Investment focus: first 3 thesis-style sentences across the corpus.
  const sentences = corpus.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const focusHits: string[] = [];
  for (const s of sentences) {
    if (FOCUS_TRIGGER.test(s) && s.length >= 30 && s.length <= 300) {
      focusHits.push(s);
      if (focusHits.length >= 3) break;
    }
  }
  const investmentFocus = focusHits.length ? focusHits.join(" — ").slice(0, FOCUS_CAP) : null;

  // Emails (dedupe, cap 5)
  const emailSet = new Set<string>();
  for (const p of pages) {
    const txt = (p.text || "") + " " + (p.metadata?.metaDescription || "");
    const matches = txt.match(EMAIL_RE) || [];
    for (const m of matches) {
      const lower = m.toLowerCase();
      if (!emailSet.has(lower) && !lower.endsWith(".png") && !lower.endsWith(".jpg")) {
        emailSet.add(lower);
        if (emailSet.size >= 5) break;
      }
    }
    if (emailSet.size >= 5) break;
  }

  const seedPage = sorted[0];
  return {
    inferredWebsite: seedPage.finalUrl || seed,
    crawlStatus: "ok",
    websiteTitle: seedPage.metadata?.title ?? seedPage.metadata?.ogTitle ?? null,
    metaDescription: seedPage.metadata?.metaDescription ?? seedPage.metadata?.ogDescription ?? null,
    investmentFocus,
    otherEmailsOnSite: Array.from(emailSet),
    crawlPathsTried: pages.map((p) => pathnameOf(p.finalUrl)),
    corpus,
  };
}

/** LLM prompt block: drop verbatim above the recipient/contact block. */
export function formatCrawlExtractForPrompt(ctx: ProfileCrawlContext): string {
  if (ctx.crawlStatus !== "ok") return "";
  const lines: string[] = [
    "WEBSITE CRAWL EXTRACT (treat as ground truth - prefer over your own guesses):",
    `Inferred Website: ${ctx.inferredWebsite ?? ""}`,
    `Website Title: ${ctx.websiteTitle ?? ""}`,
    `Meta Description: ${ctx.metaDescription ?? ""}`,
    `Investment Focus (extracted): ${ctx.investmentFocus ?? ""}`,
    "Page text:",
    ctx.corpus.slice(0, 8000),
  ];
  return lines.join("\n");
}

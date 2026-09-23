/**
 * When did this investor last invest? (docs/architecture/16)
 *
 * The directory has no investment dates: `last_funding_date` is empty for all
 * 18,982 firms. Investors publish their recent deals, so this reads them —
 * for the firms a founder actually sees at the top of a run, not for the whole
 * directory.
 *
 * A date is written only with the sentence it came from, and only when that
 * sentence really appears on the page that was fetched. An undated "we backed
 * Acme" is ignored: recency claims have to carry a date.
 */
import { sql } from "@/lib/db"
import { generate } from "@/lib/ai/provider"
import { extractJsonObject } from "@/lib/ai/json-extract"
import { extractText, extractLinks } from "@/lib/admin/web-crawler"
import { safeFetch } from "@/lib/net/safe-fetch"
import { normPhrase } from "@/lib/matching/normalize/text"

export interface ActivityFinding {
  lastInvestmentAt: string | null
  note: string | null
  sourceUrl: string | null
  /** Why nothing was found, when nothing was. */
  reason: string | null
}

const PAGE_HINT = /portfolio|investment|news|blog|update|deal|companies|press/i
const MAX_PAGES = 3
const MAX_CHARS = 12_000

export function dailyLimit(): number {
  const n = Number(process.env.ACTIVITY_DAILY_LIMIT ?? 200)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 200
}

/** A date we would believe: a real day, not in the future, not before 2005. */
function usableDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const now = Date.now()
  if (d.getTime() > now + 86_400_000) return null
  if (d.getUTCFullYear() < 2005) return null
  return value
}

export interface ActivityDeps {
  fetchPage?: (url: string) => Promise<{ finalUrl: string; body: Buffer; contentType: string }>
  ask?: (prompt: string) => Promise<string>
}

/**
 * Read one firm's own pages for its most recent dated investment.
 * Never throws: an unreachable site is a finding ("no evidence"), not an error.
 */
export async function findFirmActivity(
  firm: { id: string; name: string; website: string | null },
  deps: ActivityDeps = {},
): Promise<ActivityFinding> {
  const empty = (reason: string): ActivityFinding => ({ lastInvestmentAt: null, note: null, sourceUrl: null, reason })
  if (!firm.website) return empty("no website on file")
  const fetchPage = deps.fetchPage ?? ((url: string) => safeFetch(url, { maxBytes: 3 * 1024 * 1024, timeoutMs: 15_000 }))
  const ask = deps.ask ?? ((prompt: string) => generate(prompt, { task: "enrich_extract", json: true, maxTokens: 400, temperature: 0 }))

  const pages: { url: string; text: string }[] = []
  try {
    const home = await fetchPage(firm.website.startsWith("http") ? firm.website : `https://${firm.website}`)
    const html = home.body.toString("utf8")
    pages.push({ url: home.finalUrl, text: extractText(html, home.finalUrl) })
    const host = new URL(home.finalUrl).host
    const candidates = extractLinks(html, home.finalUrl)
      .filter((l) => PAGE_HINT.test(`${l.text} ${l.href}`))
      .filter((l) => { try { return new URL(l.href).host === host } catch { return false } })
      .slice(0, MAX_PAGES - 1)
    for (const link of candidates) {
      try {
        const page = await fetchPage(link.href)
        pages.push({ url: page.finalUrl, text: extractText(page.body.toString("utf8"), page.finalUrl) })
      } catch { /* one unreadable page does not spoil the check */ }
    }
  } catch (e: any) {
    return empty(`site unreachable: ${String(e?.message ?? e).slice(0, 120)}`)
  }

  const corpus = pages.map((p) => `--- ${p.url} ---\n${p.text}`).join("\n\n").slice(0, MAX_CHARS)
  if (corpus.trim().length < 200) return empty("no readable text on the site")

  const answer = await ask(`Below are pages from the website of the investor "${firm.name}".

Find the MOST RECENT investment this investor made that the pages give a DATE for.

Rules:
1. The date must be written on the page (a full or partial date such as "March 2026" or "2026-03-04"). If a deal has no date, ignore it.
2. "evidence" must be an EXACT sentence or phrase copied from the pages that contains both the investment and its date.
3. If no dated investment appears anywhere, return nulls. Do not guess from copyright years, team bios, or blog dates unrelated to an investment.

Return only JSON:
{"lastInvestmentAt": "YYYY-MM-DD or null (use the 1st when only a month is given)", "note": "<company and round, max 120 chars>", "evidence": "<exact quote>"}

${corpus}`).catch((e: any) => `{"error":${JSON.stringify(String(e?.message ?? e))}}`)

  const parsed = extractJsonObject(answer, "investor-activity")
  if (!parsed || parsed.error) return empty("no answer from the model")
  const date = usableDate(parsed.lastInvestmentAt)
  if (!date) return empty("no dated investment found")

  // The quote has to be on the page we fetched — otherwise the date is invented.
  const evidence = typeof parsed.evidence === "string" ? normPhrase(parsed.evidence).slice(0, 160) : ""
  if (evidence.length < 12) return empty("no quotable evidence")
  const hay = pages.map((p) => normPhrase(p.text))
  const page = pages[hay.findIndex((t) => t.includes(evidence))]
  if (!page) return empty("the quoted evidence is not on the page")

  const note = typeof parsed.note === "string" ? parsed.note.trim().slice(0, 200) : null
  return { lastInvestmentAt: date, note, sourceUrl: page.url, reason: null }
}

/** Provider-backed checks already made today, across instances. */
export async function checksToday(): Promise<number> {
  const [r] = await sql`SELECT count(*)::int AS n FROM investment_firms WHERE activity_checked_at >= date_trunc('day', now())`
  return Number(r?.n ?? 0)
}

/**
 * Check the firms founders are actually being shown: the top results of runs
 * from the last 30 days whose activity is unknown or older than 90 days.
 */
export async function runActivitySweep(opts: { limit?: number; ids?: string[]; deps?: ActivityDeps } = {}) {
  const budget = Math.max(0, Math.min(opts.limit ?? dailyLimit(), dailyLimit() - (await checksToday())))
  if (budget === 0) return { checked: 0, withDate: 0, errors: 0, budgetLeft: 0 }

  const rows = opts.ids?.length
    ? await sql`SELECT id::text AS id, name, website FROM investment_firms WHERE id::text = ANY(${opts.ids}) LIMIT ${budget}`
    : await sql`
        SELECT f.id::text AS id, f.name, f.website
          FROM investment_firms f
         WHERE f.id::text IN (
                 SELECT r.entity_id FROM founder_match_results r
                   JOIN founder_match_runs run ON run.id = r.run_id
                  WHERE run.created_at > now() - interval '30 days' AND r.kind = 'group' AND r.rank <= 200)
           AND (f.activity_checked_at IS NULL OR f.activity_checked_at < now() - interval '90 days')
         ORDER BY f.activity_checked_at NULLS FIRST
         LIMIT ${budget}`

  let withDate = 0, errors = 0
  for (const firm of rows as any[]) {
    try {
      const found = await findFirmActivity(firm, opts.deps)
      await sql`UPDATE investment_firms
                   SET last_investment_at = ${found.lastInvestmentAt}::date,
                       last_investment_note = ${found.note},
                       activity_source_url = ${found.sourceUrl},
                       activity_checked_at = now()
                 WHERE id::text = ${firm.id}`
      if (found.lastInvestmentAt) withDate++
    } catch (e: any) {
      errors++
      console.warn(`[investor-activity] ${firm.name}: ${e?.message ?? e}`)
    }
  }
  return { checked: rows.length, withDate, errors, budgetLeft: Math.max(0, dailyLimit() - (await checksToday())) }
}

/** Re-exported so callers have one import for activity (definition: normalize/recency.ts). */
export { activityRecency } from "@/lib/matching/normalize/recency"

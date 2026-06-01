/**
 * Bulk URL liveness checker for the admin tools.
 *
 * Use cases:
 *   1. Sweep all firm.website / investor.linkedin_url / investor.email
 *      domains in the DB and flag dead/redirected ones.
 *   2. One-off: paste a URL into the admin UI, get a quick verdict
 *      with status + final URL + classification.
 *
 * We use HEAD when allowed, fall back to GET (read first chunk only).
 * Concurrency is capped — most VC websites are on shared hosts and
 * 50 parallel requests can look like an attack.
 */

const DEFAULT_CONCURRENCY = 8
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; AnkerLinkChecker/1.0; +https://anker.ai/bot)"

export type UrlVerdict =
  | "live"           // 2xx
  | "redirect"       // 3xx (followed)
  | "redirected_off" // 3xx leaves the original domain (often parked)
  | "dead"           // 4xx (404 / 410 / 451)
  | "blocked"        // 401 / 403 — exists but unreachable
  | "rate_limited"   // 429
  | "server_error"   // 5xx
  | "timeout"
  | "tls_error"
  | "dns_error"
  | "unreachable"
  | "invalid_url"

export interface UrlCheckResult {
  url: string                  // requested
  finalUrl: string | null      // after redirects
  status: number
  /** Coarse verdict for the UI / DB. */
  verdict: UrlVerdict
  /** Human-friendly message — what happened. */
  detail: string
  /** Wall-clock ms. */
  durationMs: number
  /** Whether the host of `finalUrl` differs from the host of `url`. */
  domainChanged: boolean
  checkedAt: string            // ISO
}

export interface BulkCheckOptions {
  concurrency?: number
  timeoutMs?: number
  userAgent?: string
  /** Called as each URL completes. Useful for progress bars. */
  onProgress?: (done: number, total: number, latest: UrlCheckResult) => void
}

export async function checkUrl(rawUrl: string, opts: { timeoutMs?: number; userAgent?: string } = {}): Promise<UrlCheckResult> {
  const startedAt = Date.now()
  const checkedAt = new Date().toISOString()
  let url = (rawUrl ?? "").trim()
  if (!url) {
    return { url: rawUrl, finalUrl: null, status: 0, verdict: "invalid_url", detail: "Empty URL.", durationMs: 0, domainChanged: false, checkedAt }
  }
  if (!/^https?:\/\//i.test(url)) url = "https://" + url
  let parsed: URL
  try { parsed = new URL(url) } catch {
    return { url: rawUrl, finalUrl: null, status: 0, verdict: "invalid_url", detail: "Could not parse URL.", durationMs: 0, domainChanged: false, checkedAt }
  }
  const originHost = parsed.hostname.toLowerCase()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    let res: Response
    try {
      res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        headers: { "User-Agent": opts.userAgent ?? DEFAULT_USER_AGENT },
        signal: ctrl.signal,
      })
      // Some servers return 405 / 501 for HEAD — fall back to GET
      if (res.status === 405 || res.status === 501 || (res.status === 0 && res.ok === false)) {
        res = await fetch(url, {
          method: "GET",
          redirect: "follow",
          headers: { "User-Agent": opts.userAgent ?? DEFAULT_USER_AGENT, Range: "bytes=0-2048" },
          signal: ctrl.signal,
        })
      }
    } catch (e: any) {
      // HEAD failed (some hosts close the connection). Try GET.
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": opts.userAgent ?? DEFAULT_USER_AGENT, Range: "bytes=0-2048" },
        signal: ctrl.signal,
      })
    }
    const durationMs = Date.now() - startedAt
    const finalUrl = res.url || url
    let finalHost = ""
    try { finalHost = new URL(finalUrl).hostname.toLowerCase() } catch {}
    const domainChanged = finalHost !== "" && finalHost !== originHost
    const status = res.status
    let verdict: UrlVerdict = "live"
    let detail = `${status} ${res.statusText || ""}`.trim()
    if (status >= 200 && status < 300) {
      verdict = res.redirected
        ? (domainChanged ? "redirected_off" : "redirect")
        : "live"
      if (res.redirected) detail = `${verdict} → ${finalUrl}`
    } else if (status === 401 || status === 403) {
      verdict = "blocked"
    } else if (status === 429) {
      verdict = "rate_limited"
    } else if (status >= 400 && status < 500) {
      verdict = "dead"
    } else if (status >= 500) {
      verdict = "server_error"
    }
    return { url: rawUrl, finalUrl, status, verdict, detail, durationMs, domainChanged, checkedAt }
  } catch (e: any) {
    const durationMs = Date.now() - startedAt
    const msg = String(e?.message ?? e ?? "unknown")
    let verdict: UrlVerdict = "unreachable"
    if (e?.name === "AbortError" || /timeout/i.test(msg)) verdict = "timeout"
    else if (/CERT|TLS|SSL|certificate/i.test(msg)) verdict = "tls_error"
    else if (/ENOTFOUND|getaddrinfo|dns/i.test(msg)) verdict = "dns_error"
    return { url: rawUrl, finalUrl: null, status: 0, verdict, detail: msg.slice(0, 200), durationMs, domainChanged: false, checkedAt }
  } finally {
    clearTimeout(timer)
  }
}

export async function bulkCheck(urls: string[], opts: BulkCheckOptions = {}): Promise<UrlCheckResult[]> {
  const concurrency = Math.max(1, Math.min(24, opts.concurrency ?? DEFAULT_CONCURRENCY))
  const results: UrlCheckResult[] = new Array(urls.length)
  let cursor = 0
  let done = 0
  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= urls.length) return
      const r = await checkUrl(urls[i], { timeoutMs: opts.timeoutMs, userAgent: opts.userAgent })
      results[i] = r
      done++
      opts.onProgress?.(done, urls.length, r)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length || 1) }, worker))
  return results
}

/** Bucket counts for a UI summary panel. */
export function summarizeVerdicts(rows: UrlCheckResult[]): Record<UrlVerdict, number> {
  const init: Record<UrlVerdict, number> = {
    live: 0, redirect: 0, redirected_off: 0, dead: 0, blocked: 0,
    rate_limited: 0, server_error: 0, timeout: 0,
    tls_error: 0, dns_error: 0, unreachable: 0, invalid_url: 0,
  }
  for (const r of rows) init[r.verdict]++
  return init
}

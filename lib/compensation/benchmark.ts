/**
 * Compensation benchmark seam — market-data ingestion for comp bands.
 *
 * Fetches market salary + equity ranges for a role/level/geography from a configurable
 * benchmark provider (Radford, Payscale, Pave, an internal data service, …) so a founder
 * can build bands from market data instead of guessing. Provider-agnostic: point it at
 * any endpoint that speaks the contract below.
 *
 * Inert until configured: with no COMP_BENCHMARK_API_URL the client reports "not
 * configured" and the caller degrades gracefully (same pattern as the doc-worker /
 * DocuSign / Companies House seams). Never throws — returns a typed result.
 *
 * Provider contract (POST {COMP_BENCHMARK_API_URL}):
 *   request  JSON { role, level, geography, currency }   (Authorization: Bearer <key>)
 *   response JSON { baseMin, baseMax, equityMin, equityMax, source?, asOf? }
 *            (snake_case keys are also accepted). equity_* are percent (0.25 = 0.25%).
 *
 * Env:  COMP_BENCHMARK_API_URL (required to enable)  ·  COMP_BENCHMARK_API_KEY (optional bearer)
 */

const TIMEOUT_MS = 15_000

export function isBenchmarkConfigured(): boolean {
  return !!process.env.COMP_BENCHMARK_API_URL
}

export interface BenchmarkQuery {
  role: string
  level?: string | null
  geography?: string | null
  currency?: string
}

export interface BenchmarkRange {
  role: string
  level: string | null
  geography: string | null
  baseMin: number | null
  baseMax: number | null
  equityMin: number | null
  equityMax: number | null
  source: string | null
  asOf: string | null
}

export type BenchmarkResult = { ok: true; data: BenchmarkRange } | { ok: false; error: string; status?: number }

const numOrNull = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
/** Read a value under either camelCase or snake_case. */
const pick = (o: any, camel: string, snake: string) => (o?.[camel] ?? o?.[snake])

export async function fetchBenchmark(query: BenchmarkQuery): Promise<BenchmarkResult> {
  const url = process.env.COMP_BENCHMARK_API_URL
  if (!url) return { ok: false, error: "No compensation benchmark provider is configured — set COMP_BENCHMARK_API_URL to enable market data." }
  const role = String(query.role ?? "").trim()
  if (!role) return { ok: false, error: "Provide a role to benchmark." }

  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" }
  if (process.env.COMP_BENCHMARK_API_KEY) headers.authorization = `Bearer ${process.env.COMP_BENCHMARK_API_KEY}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: "POST", headers,
      body: JSON.stringify({ role, level: query.level ?? null, geography: query.geography ?? null, currency: query.currency ?? "USD" }),
      signal: controller.signal,
    })
    if (res.status === 401 || res.status === 403) return { ok: false, error: "The benchmark provider rejected the API key.", status: res.status }
    if (res.status === 404) return { ok: false, error: "No benchmark found for that role.", status: 404 }
    if (res.status === 429) return { ok: false, error: "Benchmark provider rate limit reached — try again shortly.", status: 429 }
    if (!res.ok) return { ok: false, error: `Benchmark provider returned ${res.status}.`, status: res.status }
    const j = await res.json().catch(() => null)
    if (!j) return { ok: false, error: "Benchmark provider returned an unreadable response." }
    return {
      ok: true,
      data: {
        role, level: query.level ?? null, geography: query.geography ?? null,
        baseMin: numOrNull(pick(j, "baseMin", "base_min")),
        baseMax: numOrNull(pick(j, "baseMax", "base_max")),
        equityMin: numOrNull(pick(j, "equityMin", "equity_min")),
        equityMax: numOrNull(pick(j, "equityMax", "equity_max")),
        source: (pick(j, "source", "source") ?? null) as string | null,
        asOf: (pick(j, "asOf", "as_of") ?? null) as string | null,
      },
    }
  } catch (e: any) {
    const reason = e?.name === "AbortError" ? `timed out after ${TIMEOUT_MS}ms` : (e?.message ?? "network error")
    return { ok: false, error: `Benchmark request failed: ${reason}` }
  } finally {
    clearTimeout(timer)
  }
}

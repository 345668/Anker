/**
 * OpenSanctions screening provider. When OPENSANCTIONS_API_KEY is set, this is
 * the real name-screening backend for KYC — the local kyc_watchlist is only a
 * dev fallback. Uses the hosted match API (https://api.opensanctions.org).
 *
 * We surface results the analyst must adjudicate; we never auto-decide. Errors
 * throw so the caller can tell the operator screening didn't run (rather than
 * silently returning "no hits", which would be a dangerous false clear).
 */

import { getIntegrationKey } from "@/lib/config/integration-keys"

const BASE = "https://api.opensanctions.org"

export interface ProviderHit {
  list: "sanctions" | "pep" | "adverse_media"
  match_name: string
  program: string | null
  country: string | null
  score: number
  source_url: string | null
}

export async function isOpenSanctionsConfigured(): Promise<boolean> {
  return !!(await getIntegrationKey("OPENSANCTIONS_API_KEY"))
}

// OpenSanctions "topics" → our coarse list category (most severe wins).
function topicsToList(topics: string[]): ProviderHit["list"] {
  if (topics.some((t) => t === "sanction" || t.startsWith("sanction"))) return "sanctions"
  if (topics.some((t) => t.startsWith("role."))) return "pep" // role.pep / role.pol / role.rca
  return "adverse_media" // crime, poi, wanted, debarment, export.control, …
}

const arr = (v: any): string[] => (Array.isArray(v) ? v : v == null ? [] : [String(v)])

/**
 * Screen one subject name. Keeps matches the API flagged (`match: true`) or that
 * score at/above `minScore` (default 0.70, OpenSanctions' usual cutoff).
 */
export async function screenViaOpenSanctions(
  name: string,
  subjectType: "individual" | "entity",
  opts: { minScore?: number; scope?: string } = {},
): Promise<ProviderHit[]> {
  const key = await getIntegrationKey("OPENSANCTIONS_API_KEY")
  if (!key) throw new Error("OPENSANCTIONS_API_KEY not set")
  const minScore = opts.minScore ?? 0.7
  const scope = opts.scope ?? "default"
  const schema = subjectType === "entity" ? "Company" : "Person"

  let res: Response
  try {
    res = await fetch(`${BASE}/match/${scope}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `ApiKey ${key}` },
      body: JSON.stringify({ queries: { q: { schema, properties: { name: [name] } } } }),
      // Don't hang the request forever on a slow provider.
      signal: AbortSignal.timeout(15000),
    })
  } catch (e: any) {
    throw new Error(`OpenSanctions request failed: ${e?.message ?? e}`)
  }
  if (res.status === 429) throw new Error("OpenSanctions rate limit reached — try again shortly.")
  if (!res.ok) throw new Error(`OpenSanctions returned ${res.status}`)

  const data = await res.json().catch(() => null)
  const results: any[] = data?.responses?.q?.results ?? []

  return results
    .filter((r) => r.match === true || Number(r.score ?? 0) >= minScore)
    .slice(0, 15)
    .map((r) => {
      const topics = arr(r.properties?.topics)
      const datasets = arr(r.datasets)
      const country = arr(r.properties?.country)[0] ?? null
      return {
        list: topicsToList(topics),
        match_name: r.caption ?? name,
        program: datasets.slice(0, 3).join(", ") || null,
        country: country ? country.toUpperCase() : null,
        score: Math.round(Number(r.score ?? 0) * 1000) / 1000,
        source_url: r.id ? `https://www.opensanctions.org/entities/${r.id}/` : null,
      }
    })
}

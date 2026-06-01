/**
 * GET /api/admin/system
 *
 * Returns a single status snapshot for the admin home / system page:
 *
 *   - Postgres reachability + table counts + pgvector / unique source tags
 *   - Ollama reachability + pulled model list + AI router task→model map
 *   - Twenty / SearXNG / Marker reachability
 *
 * All checks are wrapped in try/catch + small per-call timeouts so a
 * single slow integration never makes the whole request hang.
 *
 * Admin-gated.
 */
import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  providerInfo, listAvailableOllamaModels, resetProvider, invalidateModelsCache,
} from "@/lib/ai/provider"
import { isTwentyConfigured } from "@/lib/twenty/client"
import { isSearxngAvailable } from "@/lib/agents/web-search"
import { isMarkerAvailable } from "@/lib/ai/pdf-marker"

export const runtime = "nodejs"
export const maxDuration = 30

interface ServiceStatus {
  name: string
  configured: boolean
  reachable: boolean
  detail: string
  meta?: Record<string, any>
}

/**
 * The system page is THE place admins go when the platform's
 * misbehaving. We don't want them seeing a stale `resolveProvider()`
 * cache from an earlier failed probe. Every GET starts by invalidating
 * the provider + models caches so a transient Ollama-down at boot
 * doesn't stick.
 */
export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard

  resetProvider()
  invalidateModelsCache()

  const services: ServiceStatus[] = []
  let postgres: any = { ok: false, detail: "" }
  let dbStats: any = null

  // Postgres
  try {
    const startedAt = Date.now()
    const ping = await sql`SELECT 1 AS ok`
    postgres = { ok: ping.length > 0, detail: `${Date.now() - startedAt}ms` }

    // Counts (each one wrapped — some may not exist on a partial DB)
    dbStats = {
      firms: await safeCount(`SELECT COUNT(*) FROM investment_firms`),
      investors: await safeCount(`SELECT COUNT(*) FROM investors`),
      crm_entries: await safeCount(`SELECT COUNT(*) FROM crm_entries`),
      outreach_messages: await safeCount(`SELECT COUNT(*) FROM outreach_messages`),
      outreach_replies: await safeCount(`SELECT COUNT(*) FROM outreach_replies`),
      news_articles: await safeCount(`SELECT COUNT(*) FROM news_articles`),
      lp_match_sessions: await safeCount(`SELECT COUNT(*) FROM lp_match_sessions`),
      fund_profiles: await safeCount(`SELECT COUNT(*) FROM fund_profiles`),
    }

    // Top firm sources (helpful when triaging "where did these rows come from")
    const sources = await sql`
      SELECT source, COUNT(*) AS n FROM investment_firms
      WHERE source IS NOT NULL GROUP BY source ORDER BY n DESC LIMIT 12
    `.catch(() => [] as any[])
    dbStats.firms_by_source = (sources as any[]).map((r) => ({ source: r.source, n: Number(r.n) }))

    // pgvector probe — does the embedding column exist + how many rows have one?
    const embed = await sql`
      SELECT
        (SELECT COUNT(*) FROM investment_firms WHERE embedding IS NOT NULL) AS firms_embedded,
        (SELECT COUNT(*) FROM investors WHERE embedding IS NOT NULL) AS investors_embedded,
        (SELECT COUNT(*) FROM crm_entries WHERE embedding IS NOT NULL) AS crm_embedded
    `.catch(() => null)
    if (embed && (embed as any[])[0]) {
      const r = (embed as any[])[0]
      dbStats.embeddings = {
        firms: Number(r.firms_embedded ?? 0),
        investors: Number(r.investors_embedded ?? 0),
        crm: Number(r.crm_embedded ?? 0),
      }
    } else {
      dbStats.embeddings = null
    }
  } catch (e: any) {
    postgres = { ok: false, detail: e?.message ?? "unreachable" }
  }
  services.push({
    name: "postgres",
    configured: !!process.env.DATABASE_URL,
    reachable: postgres.ok,
    detail: postgres.detail,
    meta: dbStats,
  })

  // Ollama + AI router map
  try {
    const info = await providerInfo()
    const models = info.provider === "ollama" ? await listAvailableOllamaModels() : []
    services.push({
      name: "ollama",
      configured: info.provider !== "none",
      reachable: info.provider === "ollama" || info.provider === "anthropic",
      detail: info.provider === "ollama"
        ? `${models.length} model(s) pulled`
        : info.provider === "anthropic"
          ? "anthropic active"
          : "no provider",
      meta: {
        provider: info.provider,
        defaultModel: info.model,
        url: info.url,
        models,
        routing: info.routing,
      },
    })
  } catch (e: any) {
    services.push({ name: "ollama", configured: false, reachable: false, detail: e?.message ?? "error" })
  }

  // Twenty
  try {
    const configured = isTwentyConfigured()
    let reachable = false
    if (configured) {
      const url = process.env.TWENTY_BASE_URL!.replace(/\/+$/, "")
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 1500)
      try {
        const res = await fetch(`${url}/healthz`, { signal: ctrl.signal })
        reachable = res.ok
      } catch {
        // Twenty might not have /healthz on every version; HEAD / also works
        try {
          const r2 = await fetch(`${url}/`, { method: "HEAD", signal: ctrl.signal })
          reachable = r2.status < 500
        } catch {/* unreachable */}
      } finally { clearTimeout(t) }
    }
    services.push({
      name: "twenty",
      configured,
      reachable,
      detail: configured ? (reachable ? "online" : "configured but unreachable") : "TWENTY_BASE_URL + TWENTY_API_KEY not set",
      meta: configured ? { url: process.env.TWENTY_BASE_URL } : undefined,
    })
  } catch (e: any) {
    services.push({ name: "twenty", configured: false, reachable: false, detail: e?.message ?? "error" })
  }

  // SearXNG
  try {
    const reachable = await isSearxngAvailable()
    services.push({
      name: "searxng",
      configured: !!process.env.SEARXNG_URL,
      reachable,
      detail: reachable ? "online" : (process.env.SEARXNG_URL ? "configured but unreachable" : "SEARXNG_URL not set"),
      meta: { url: process.env.SEARXNG_URL ?? null },
    })
  } catch (e: any) {
    services.push({ name: "searxng", configured: false, reachable: false, detail: e?.message ?? "error" })
  }

  // Marker
  try {
    const reachable = await isMarkerAvailable()
    services.push({
      name: "marker",
      configured: !!process.env.MARKER_URL,
      reachable,
      detail: reachable ? "online (CV models loaded)" : (process.env.MARKER_URL ? "container up but model not loaded yet" : "MARKER_URL not set"),
      meta: { url: process.env.MARKER_URL ?? null },
    })
  } catch (e: any) {
    services.push({ name: "marker", configured: false, reachable: false, detail: e?.message ?? "error" })
  }

  return NextResponse.json({
    snapshotAt: new Date().toISOString(),
    services,
    dbStats,
  })
}

async function safeCount(q: string): Promise<number> {
  try {
    const r: any[] = await sql.unsafe(q)
    return Number(r[0]?.count ?? r[0]?.n ?? 0) || 0
  } catch {
    return -1
  }
}

/**
 * POST /api/admin/system  — kick caches and re-probe.  Use after
 * starting Ollama / Marker / SearXNG / Twenty without restarting Anker.
 */
export async function POST() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  resetProvider()
  invalidateModelsCache()
  return NextResponse.json({ ok: true, reconnectedAt: new Date().toISOString() })
}

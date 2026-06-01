/**
 * POST /api/admin/url-check/fix
 *
 * Three repair modes for a broken URL surfaced by /api/admin/url-check:
 *
 *   { mode: "search", ownerKind, ownerId, field }
 *     SearXNG-driven: searches the web for the owner (firm name +
 *     "venture capital" / investor full name + firm) and proposes the
 *     top hit's URL.
 *
 *   { mode: "ai", ownerKind, ownerId, field }
 *     Local-AI: gives the model whatever the DB knows about the owner
 *     (name, location, sectors, prior URL) and asks for the most
 *     likely correct URL.  Returns "" when the model has no idea.
 *
 *   { mode: "manual", ownerKind, ownerId, field, url }
 *     User-supplied: writes the typed URL directly (after validation +
 *     a single liveness check).
 *
 * In all three cases, when the new URL is supplied / found AND
 * `apply: true`, we re-check it once and write it back to:
 *   - investment_firms.website   (for ownerKind = "firm")
 *   - investors.linkedin_url     (for ownerKind = "investor", field = "linkedin_url")
 *   - investors.website          (when field = "website")
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAdmin } from "@/lib/auth/require-admin"
import { checkUrl } from "@/lib/admin/url-check"
import { search, isSearxngAvailable } from "@/lib/agents/web-search"
import { generate } from "@/lib/ai/provider"

export const runtime = "nodejs"
export const maxDuration = 120

type OwnerKind = "firm" | "investor"
type FixMode = "ai" | "search" | "manual"

interface Body {
  mode: FixMode
  ownerKind: OwnerKind
  ownerId: string
  field: "website" | "linkedin_url"
  url?: string
  apply?: boolean
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard

  try {
    const body = (await req.json()) as Body
    if (!body?.ownerKind || !body?.ownerId || !body?.field || !body?.mode) {
      return NextResponse.json({ error: "mode + ownerKind + ownerId + field required" }, { status: 400 })
    }

    // Look up the owner row for context.
    const owner = await loadOwner(body.ownerKind, body.ownerId)
    if (!owner) return NextResponse.json({ error: "owner not found" }, { status: 404 })

    let proposed: string | null = null
    let candidates: { url: string; title: string; snippet: string }[] = []
    let detail = ""

    if (body.mode === "manual") {
      if (!body.url || !body.url.trim()) {
        return NextResponse.json({ error: "url required for manual mode" }, { status: 400 })
      }
      proposed = normalizeUrl(body.url)
      detail = "user-provided"
    } else if (body.mode === "search") {
      if (!(await isSearxngAvailable())) {
        return NextResponse.json({
          error: "SearXNG not reachable.  Set SEARXNG_URL or bring up the searxng container.",
        }, { status: 503 })
      }
      const query = buildSearchQuery(body.ownerKind, body.field, owner)
      const hits = await search(query, { limit: 8, categories: ["general"] })
      candidates = hits.map((h) => ({ url: h.url, title: h.title, snippet: h.snippet }))
      const ranked = rankSearchHits(body.ownerKind, body.field, owner, candidates)
      proposed = ranked[0]?.url ?? null
      detail = `searxng (${candidates.length} hits)`
    } else if (body.mode === "ai") {
      proposed = await proposeViaAi(body.ownerKind, body.field, owner)
      detail = "local-ai"
    } else {
      return NextResponse.json({ error: `unknown mode: ${body.mode}` }, { status: 400 })
    }

    let probe = null
    if (proposed) probe = await checkUrl(proposed, { timeoutMs: 8000 })

    let applied = false
    if (proposed && body.apply) {
      const ok = probe && (probe.verdict === "live" || probe.verdict === "redirect")
      if (!ok) {
        return NextResponse.json({
          proposed, probe, candidates, detail,
          error: "proposed URL is not live; refusing to apply",
        }, { status: 422 })
      }
      await writeBack(body.ownerKind, body.ownerId, body.field, probe!.finalUrl ?? proposed)
      applied = true
    }

    return NextResponse.json({
      mode: body.mode,
      proposed,
      probe,
      candidates,
      applied,
      detail,
    })
  } catch (e: any) {
    console.error("[admin/url-check/fix] error:", e)
    return NextResponse.json({ error: e?.message ?? "fix failed" }, { status: 500 })
  }
}

// ─── helpers ───────────────────────────────────────────────────────────
async function loadOwner(kind: OwnerKind, id: string): Promise<any | null> {
  if (kind === "firm") {
    // Only select columns we actually use in the AI prompt + ranker.
    // Avoid optional columns (founded_year, sectors as JSONB) that may
    // not exist in older Anker schemas.
    const [r] = await sql`SELECT id, name, type, hq_location, location, website, description
                          FROM investment_firms WHERE id = ${id} LIMIT 1`
    return r ?? null
  }
  const [r] = await sql`SELECT i.id, i.first_name, i.last_name, i.title, i.linkedin_url,
                               i.location, i.firm_id, i.bio,
                               f.name AS firm_name, f.website AS firm_website
                        FROM investors i
                        LEFT JOIN investment_firms f ON i.firm_id = f.id
                        WHERE i.id = ${id} LIMIT 1`
  return r ?? null
}

function buildSearchQuery(kind: OwnerKind, field: "website" | "linkedin_url", o: any): string {
  if (kind === "firm") {
    if (field === "linkedin_url") return `${o.name} venture capital site:linkedin.com/company`
    return `${o.name} venture capital${o.hq_location ? ` ${o.hq_location.split(",")[0]}` : ""}`
  }
  // investor
  const fullName = [o.first_name, o.last_name].filter(Boolean).join(" ")
  if (field === "linkedin_url") {
    return `${fullName} ${o.firm_name ?? ""} site:linkedin.com/in`
  }
  return `${fullName} ${o.firm_name ?? "venture"}`
}

function rankSearchHits(kind: OwnerKind, field: "website" | "linkedin_url", o: any, hits: { url: string; title: string; snippet: string }[]): { url: string; rank: number }[] {
  const slug = kind === "firm"
    ? String(o.name).toLowerCase().replace(/[^a-z0-9]+/g, "")
    : (`${o.first_name ?? ""}${o.last_name ?? ""}`).toLowerCase().replace(/[^a-z0-9]+/g, "")
  return hits.map((h) => {
    let rank = 0
    try {
      const u = new URL(h.url)
      const host = u.hostname.toLowerCase().replace(/^www\./, "")
      if (field === "linkedin_url") {
        if (host === "linkedin.com" || host.endsWith(".linkedin.com")) rank += 0.6
        const path = u.pathname.toLowerCase()
        if (kind === "firm" && path.startsWith("/company")) rank += 0.2
        if (kind === "investor" && path.startsWith("/in/")) rank += 0.2
      } else {
        const hostSlug = host.replace(/[^a-z0-9]+/g, "")
        if (hostSlug.startsWith(slug.slice(0, 8))) rank += 0.4
        if (/(\.vc|\.fund|\.capital|\.ventures)$/i.test(host)) rank += 0.1
        if (/linkedin|crunchbase|wikipedia|twitter|x\.com|facebook/i.test(host)) rank -= 0.3
      }
    } catch {}
    return { url: h.url, rank }
  }).sort((a, b) => b.rank - a.rank)
}

async function proposeViaAi(kind: OwnerKind, field: "website" | "linkedin_url", o: any): Promise<string | null> {
  const ctx =
    kind === "firm"
      ? `Firm: ${o.name}\nType: ${o.type ?? ""}\nHQ: ${o.hq_location ?? o.location ?? ""}\nDescription: ${(o.description ?? "").slice(0, 240)}\nPrior URL on file (broken): ${o.website ?? "none"}`
      : `Person: ${[o.first_name, o.last_name].filter(Boolean).join(" ")}\nTitle: ${o.title ?? ""}\nFirm: ${o.firm_name ?? ""}\nLocation: ${o.location ?? ""}\nFirm site: ${o.firm_website ?? ""}\nPrior LinkedIn on file (broken): ${o.linkedin_url ?? "none"}`
  const target = field === "linkedin_url" ? "LinkedIn URL" : "homepage URL"
  const prompt = `You are a research analyst.  Given the context below, return ONLY the most likely correct ${target} for this entity, or the literal token "UNKNOWN" if you can't reasonably guess.

Rules:
- For LinkedIn firm pages, prefer https://www.linkedin.com/company/<slug>
- For LinkedIn person pages, prefer https://www.linkedin.com/in/<slug>
- For firm homepages, prefer the canonical apex (no /about, no /portfolio).
- Do NOT invent a URL.  If the firm/person could plausibly map to multiple domains, return UNKNOWN.

Context:
${ctx}

Output: a single URL on one line, or UNKNOWN.  No prose, no markdown.`
  const out = await generate(prompt, { task: "url_classify", maxTokens: 80, temperature: 0.1 })
  const cleaned = (out ?? "").trim().replace(/^["'`]+|["'`]+$/g, "")
  if (!cleaned || /^UNKNOWN$/i.test(cleaned)) return null
  // Take only the first URL-ish token if the model rambled
  const m = cleaned.match(/https?:\/\/[^\s"'<>]+/)
  return m ? m[0] : null
}

function normalizeUrl(s: string): string {
  s = s.trim()
  if (!s) return s
  if (!/^https?:\/\//i.test(s)) s = "https://" + s
  return s
}

async function writeBack(kind: OwnerKind, id: string, field: "website" | "linkedin_url", url: string) {
  if (kind === "firm") {
    if (field === "website") {
      await sql`UPDATE investment_firms SET website = ${url}, updated_at = NOW() WHERE id = ${id}`
    } else {
      // Firms don't have a linkedin column directly; store on description as a fallback signal.
      await sql`UPDATE investment_firms SET updated_at = NOW() WHERE id = ${id}`
    }
  } else {
    if (field === "linkedin_url") {
      await sql`UPDATE investors SET linkedin_url = ${url}, person_linkedin_url = COALESCE(person_linkedin_url, ${url}), updated_at = NOW() WHERE id = ${id}`
    } else {
      // No 'website' column on investors in our schema; no-op
      await sql`UPDATE investors SET updated_at = NOW() WHERE id = ${id}`
    }
  }
}

/**
 * GET /api/extension/context?urls=<comma-separated LinkedIn profile URLs, max 25>
 *
 * The extension's intelligence back-feed: for each profile URL, everything
 * Anker already knows about the person —
 *
 *   known          "crm" | "network" | null (badge: skip the already-captured)
 *   name           best display name we hold
 *   capturedAt     linkedin_connections.updated_at
 *   jobChange      { previousCompany, previousTitle, at } when a re-capture saw a move
 *   introPaths     count of mutual connections we can route an intro through
 *   crm            { stage, score, tier } from crm_entries when matched
 *   outreach       { status, kind, sentAt, opens } of the most recent outreach message
 *   dealMatches    active deals whose company matches the person's firm
 *
 * Powers the profile overlay, search-result badges, warm-intro hints, and
 * outreach status. Bearer-token authed; CORS open; read-only.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth"
import { normalizeLinkedInUrl } from "@/lib/portfolio/network-graph"

export const runtime = "nodejs"
export const maxDuration = 30

export async function OPTIONS() { return corsOptionsResponse() }

const MAX_URLS = 25
const ACTIVE_DEAL_STAGES = ["sourced", "screened", "deep_dive", "ic_scheduled", "ic_approved", "term_sheet", "committed"]

interface UrlContext {
  known: "crm" | "network" | null
  name: string | null
  company: string | null
  capturedAt: string | null
  jobChange: { previousCompany: string | null; previousTitle: string | null; at: string } | null
  introPaths: number
  crm: { stage: string | null; score: number | null; tier: string | null } | null
  outreach: { status: string | null; kind: string | null; sentAt: string | null; opens: number | null } | null
  dealMatches: Array<{ id: string; company: string; stage: string }>
}

export async function GET(req: NextRequest) {
  const auth = await authenticateExtension(req)
  if (!auth.ok) return auth.response

  const raw = (req.nextUrl.searchParams.get("urls") || "").split(",").map((s) => s.trim()).filter(Boolean)
  if (!raw.length) {
    return NextResponse.json({ error: "urls required" }, { status: 400, headers: corsHeaders() })
  }
  const urls: string[] = Array.from(new Set(
    raw.map((u) => String(normalizeLinkedInUrl(u))).filter((u) => u.length > 0),
  )).slice(0, MAX_URLS)

  // slug tails for crm_entries.display_linkedin LIKE matching ("…/in/slug")
  const tails = urls.map((u) => u.replace(/^linkedin\.com\//, ""))

  const [connections, mutualCounts, crmRows] = await Promise.all([
    sql`
      select linkedin_url, full_name, company, title, updated_at,
             previous_company, previous_title, job_changed_at
      from linkedin_connections
      where owner_id = ${auth.userId} and linkedin_url = any(${urls})
    ` as Promise<Array<{
      linkedin_url: string; full_name: string; company: string | null; title: string | null
      updated_at: string; previous_company: string | null; previous_title: string | null
      job_changed_at: string | null
    }>>,
    sql`
      select person_url, count(*)::int as n
      from linkedin_mutuals
      where owner_id = ${auth.userId} and person_url = any(${urls})
      group by person_url
    ` as Promise<Array<{ person_url: string; n: number }>>,
    tails.length
      ? (sql`
          select id, display_name, display_linkedin, stage, display_score, display_tier
          from crm_entries
          where user_id = ${auth.userId}
            and display_linkedin is not null
            and lower(display_linkedin) similar to ${"%(" + tails.map((t) => t.replace(/([%_|()\\])/g, "\\$1")).join("|") + ")%"}
        ` as Promise<Array<{
          id: string; display_name: string | null; display_linkedin: string | null
          stage: string | null; display_score: number | null; display_tier: string | null
        }>>)
      : Promise.resolve([]),
  ])

  const connByUrl = new Map(connections.map((c) => [c.linkedin_url, c]))
  const mutualsByUrl = new Map(mutualCounts.map((m) => [m.person_url, m.n]))

  // Map crm rows back to the requested url via the normalized tail.
  const crmByUrl = new Map<string, (typeof crmRows)[number]>()
  for (const row of crmRows) {
    const norm: string = String(normalizeLinkedInUrl(row.display_linkedin))
    for (const u of urls) {
      if (norm === u || norm.endsWith(u.replace(/^linkedin\.com\//, "")) || u.endsWith(norm.replace(/^linkedin\.com\//, ""))) {
        if (!crmByUrl.has(u)) crmByUrl.set(u, row)
      }
    }
  }

  // Latest outreach message per matched CRM entry.
  const crmIds = Array.from(new Set(Array.from(crmByUrl.values()).map((r) => r.id)))
  const outreachByCrm = new Map<string, { status: string | null; kind: string | null; sent_at: string | null; opens: number | null }>()
  if (crmIds.length) {
    const rows = await sql`
      select distinct on (crm_entry_id)
        crm_entry_id, status, kind, sent_at, opens
      from outreach_messages
      where user_id = ${auth.userId} and crm_entry_id = any(${crmIds})
      order by crm_entry_id, created_at desc
    ` as Array<{ crm_entry_id: string; status: string | null; kind: string | null; sent_at: string | null; opens: number | null }>
    for (const r of rows) outreachByCrm.set(r.crm_entry_id, r)
  }

  // Active deals whose company matches any person's firm.
  const companies = Array.from(new Set(
    connections.map((c) => (c.company || "").trim().toLowerCase()).filter(Boolean),
  ))
  const dealsByCompany = new Map<string, Array<{ id: string; company: string; stage: string }>>()
  if (companies.length) {
    const rows = await sql`
      select id, company_name, stage
      from deal_opportunities
      where stage = any(${ACTIVE_DEAL_STAGES})
        and lower(trim(company_name)) = any(${companies})
      limit 100
    ` as Array<{ id: string; company_name: string; stage: string }>
    for (const d of rows) {
      const key = d.company_name.trim().toLowerCase()
      const arr = dealsByCompany.get(key) || []
      arr.push({ id: d.id, company: d.company_name, stage: d.stage })
      dealsByCompany.set(key, arr)
    }
  }

  const contexts: Record<string, UrlContext> = {}
  for (const u of urls) {
    const conn = connByUrl.get(u)
    const crm = crmByUrl.get(u)
    const outreach = crm ? outreachByCrm.get(crm.id) : undefined
    contexts[u] = {
      known: crm ? "crm" : conn ? "network" : null,
      name: crm?.display_name ?? conn?.full_name ?? null,
      company: conn?.company ?? null,
      capturedAt: conn?.updated_at ?? null,
      jobChange: conn?.job_changed_at
        ? { previousCompany: conn.previous_company, previousTitle: conn.previous_title, at: conn.job_changed_at }
        : null,
      introPaths: mutualsByUrl.get(u) ?? 0,
      crm: crm ? { stage: crm.stage, score: crm.display_score, tier: crm.display_tier } : null,
      outreach: outreach
        ? { status: outreach.status, kind: outreach.kind, sentAt: outreach.sent_at, opens: outreach.opens }
        : null,
      dealMatches: conn?.company ? (dealsByCompany.get(conn.company.trim().toLowerCase()) ?? []) : [],
    }
  }

  return NextResponse.json({ ok: true, contexts }, { headers: corsHeaders() })
}

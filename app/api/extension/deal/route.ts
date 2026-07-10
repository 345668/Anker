/**
 * POST /api/extension/deal — "Add as deal" from a LinkedIn profile.
 *
 * Creates a `sourced` deal on the flagship fund from a founder's profile —
 * mirroring the public /pitch intake but sourced by the GP while browsing.
 * The founder profile is also captured into linkedin_connections so the
 * person shows in the network graph.
 *
 * Body: { url, name, company?, headline?, title?, location?, roundName?, notes? }
 * Bearer-token authed; CORS open.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth"
import { normalizeLinkedInUrl } from "@/lib/portfolio/network-graph"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { createDeal, hasDealTables } from "@/lib/portfolio/deal-pipeline"

export const runtime = "nodejs"
export const maxDuration = 60

const FLAGSHIP_SLUG = "svs-fund-ii"

export async function OPTIONS() { return corsOptionsResponse() }

const str = (v: unknown, max = 300): string | null => {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

export async function POST(req: NextRequest) {
  const auth = await authenticateExtension(req)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders() })
  }

  const name = str(body.name, 120)
  const company = str(body.company, 120)
  if (!name && !company) {
    return NextResponse.json({ error: "name or company required" }, { status: 400, headers: corsHeaders() })
  }

  if (!(await hasDealTables())) {
    return NextResponse.json({ error: "Deal tables not provisioned." }, { status: 503, headers: corsHeaders() })
  }
  const fund = await getFundBySlug(FLAGSHIP_SLUG)
  if (!fund) {
    return NextResponse.json({ error: "Flagship fund not found." }, { status: 503, headers: corsHeaders() })
  }

  const url = normalizeLinkedInUrl(str(body.url, 300))
  const headline = str(body.headline, 300)

  // Round guess from the headline if the caller didn't pick one.
  let roundName = str(body.roundName, 60)
  if (!roundName && headline) {
    const h = headline.toLowerCase()
    if (/pre-?seed/.test(h)) roundName = "Pre-seed"
    else if (/\bseed\b/.test(h)) roundName = "Seed"
    else if (/series\s*a/.test(h)) roundName = "Series A"
    else if (/series\s*b/.test(h)) roundName = "Series B"
  }

  const deal = await createDeal({
    fundId: fund.id,
    companyName: company ?? `${name} (company TBC)`,
    website: null,
    oneLiner: headline,
    sector: null,
    geography: str(body.location, 120),
    roundName,
    raiseAmount: null,
    source: "linkedin (extension)",
    notes: [str(body.notes, 2000), url ? `Founder LinkedIn: https://${url}` : null].filter(Boolean).join("\n") || null,
    deckUrl: null,
    contactName: name,
    contactEmail: null,
    submittedVia: "extension",
    createdBy: auth.userId,
  })

  // Capture the founder into the network graph too (idempotent upsert).
  if (url && name) {
    await sql`
      insert into linkedin_connections
        (owner_id, linkedin_url, full_name, headline, company, title, location, degree, raw)
      values (
        ${auth.userId}, ${url}, ${name}, ${headline}, ${company},
        ${str(body.title, 200)}, ${str(body.location, 200)}, 2,
        ${JSON.stringify({ source: "add-as-deal", dealId: deal.id })}::jsonb
      )
      on conflict (owner_id, linkedin_url) do update set
        raw = coalesce(linkedin_connections.raw, '{}'::jsonb) || ${JSON.stringify({ dealId: deal.id })}::jsonb,
        updated_at = now()
    `
  }

  return NextResponse.json(
    { ok: true, dealId: deal.id, companyName: deal.company_name, stage: deal.stage },
    { status: 201, headers: corsHeaders() },
  )
}

/**
 * POST /api/extension/connections
 *
 * Bulk upsert of LinkedIn people captured by the Anker extension — your
 * 1st-degree connections list, search results, or "People you may know". Each
 * card becomes a `linkedin_connections` row (owner-scoped, keyed by normalized
 * url). These are merged with CRM `contacts` at read time to build the graph.
 *
 * Body: { connections: Array<{ url, name, headline?, company?, title?, location?, image?, degree?, raw? }> }
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth"
import { normalizeLinkedInUrl } from "@/lib/portfolio/network-graph"

export const runtime = "nodejs"
export const maxDuration = 90

export async function OPTIONS() { return corsOptionsResponse() }

interface IncomingCard {
  url?: string
  name?: string
  headline?: string
  company?: string
  title?: string
  location?: string
  image?: string
  degree?: number
  raw?: unknown
}

export async function POST(req: NextRequest) {
  const auth = await authenticateExtension(req)
  if (!auth.ok) return auth.response
  const ownerId = auth.userId

  let body: { connections?: IncomingCard[] } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders() })
  }
  const cards = Array.isArray(body.connections) ? body.connections : []
  if (!cards.length) {
    return NextResponse.json({ error: "connections[] required" }, { status: 400, headers: corsHeaders() })
  }

  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const c of cards) {
    const url = normalizeLinkedInUrl(c.url)
    const name = String(c.name || "").trim()
    if (!url || !name) { skipped++; continue }
    const degree = Number(c.degree) >= 1 && Number(c.degree) <= 3 ? Math.floor(Number(c.degree)) : 1

    const rows = await sql`
      insert into linkedin_connections
        (owner_id, linkedin_url, full_name, headline, company, title, location, image_url, degree, raw)
      values (
        ${ownerId}, ${url}, ${name}, ${c.headline || null}, ${c.company || null},
        ${c.title || null}, ${c.location || null}, ${c.image || null}, ${degree},
        ${c.raw ? JSON.stringify(c.raw) : null}::jsonb
      )
      on conflict (owner_id, linkedin_url) do update set
        full_name = excluded.full_name,
        headline  = coalesce(excluded.headline, linkedin_connections.headline),
        company   = coalesce(excluded.company, linkedin_connections.company),
        title     = coalesce(excluded.title, linkedin_connections.title),
        location  = coalesce(excluded.location, linkedin_connections.location),
        image_url = coalesce(excluded.image_url, linkedin_connections.image_url),
        degree    = least(linkedin_connections.degree, excluded.degree),
        raw       = coalesce(excluded.raw, linkedin_connections.raw),
        updated_at = now()
      returning (xmax = 0) as inserted
    ` as Array<{ inserted: boolean }>
    if (rows[0]?.inserted) inserted++; else updated++
  }

  return NextResponse.json(
    { ok: true, inserted, updated, skipped, received: cards.length },
    { headers: corsHeaders() },
  )
}

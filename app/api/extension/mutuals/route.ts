/**
 * POST /api/extension/mutuals
 *
 * Records "you and PERSON both know MUTUAL" edges scraped from a LinkedIn
 * profile's mutual-connections widget. Powers the 2nd/3rd-degree web and the
 * "intro path" suggestions in the in-app relationship graph.
 *
 * Body: { personUrl, mutuals: Array<{ name, url? }> }
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth"
import { normalizeLinkedInUrl } from "@/lib/portfolio/network-graph"

export const runtime = "nodejs"

export async function OPTIONS() { return corsOptionsResponse() }

export async function POST(req: NextRequest) {
  const auth = await authenticateExtension(req)
  if (!auth.ok) return auth.response
  const ownerId = auth.userId

  let body: { personUrl?: string; mutuals?: Array<{ name?: string; url?: string }> } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders() })
  }
  const personUrl = normalizeLinkedInUrl(body.personUrl)
  const mutuals = Array.isArray(body.mutuals) ? body.mutuals : []
  if (!personUrl) {
    return NextResponse.json({ error: "personUrl required" }, { status: 400, headers: corsHeaders() })
  }

  let saved = 0
  for (const m of mutuals) {
    const name = String(m.name || "").trim()
    if (!name) continue
    const mutualUrl = m.url ? normalizeLinkedInUrl(m.url) : null
    await sql`
      insert into linkedin_mutuals (owner_id, person_url, mutual_url, mutual_name)
      values (${ownerId}, ${personUrl}, ${mutualUrl}, ${name})
      on conflict (owner_id, person_url, mutual_name) do update set
        mutual_url = coalesce(excluded.mutual_url, linkedin_mutuals.mutual_url),
        captured_at = now()
    `
    saved++
  }

  return NextResponse.json({ ok: true, saved, personUrl }, { headers: corsHeaders() })
}

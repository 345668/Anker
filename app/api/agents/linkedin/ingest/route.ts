/**
 * POST /api/agents/linkedin/ingest
 *
 * Take a chunk of HTML the user captured from an authenticated
 * LinkedIn page (typically via the Claude in Chrome extension), run it
 * through lib/agents/linkedin-public.ts parseProfileSnippetHtml(), and
 * persist the structured snippet onto a matching crm_entries row.
 *
 * Body:
 *   {
 *     url: string                 // the canonical LinkedIn URL of the profile
 *     html: string                // the rendered HTML — required
 *     finalUrl?: string           // after redirects (defaults to `url`)
 *     status?: number             // HTTP status the browser saw (default 200)
 *     crmEntryId?: string         // explicit target row
 *     source?: string             // free-form provenance tag (default "chrome-extension")
 *   }
 *
 * Resolution: if crmEntryId isn't supplied we look up the matching
 * crm_entries row by display_linkedin (case-insensitive, ignoring
 * scheme + trailing slash).
 *
 * Persists:
 *   - crm_entries.linkedin_data    JSONB snippet (full shape)
 *   - crm_entries.linkedin_data_at TIMESTAMPTZ
 *   - crm_entries.research_summary if currently blank, filled with a
 *                                  short digest so the existing CRM /
 *                                  Outreach Studio surfaces it.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { parseProfileSnippetHtml } from "@/lib/agents/linkedin-public"

export const runtime = "nodejs"
export const maxDuration = 90

function normalizeLinkedinUrl(u: string | null | undefined): string {
  if (!u) return ""
  return String(u).trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
}

async function findCrmEntryByLinkedin(userId: string, url: string): Promise<string | null> {
  const norm = normalizeLinkedinUrl(url)
  if (!norm) return null
  const tail = norm.startsWith("linkedin.com/") ? norm.slice("linkedin.com/".length) : norm
  // First try an exact tail match (the most common shape: linkedin.com/in/<slug>)
  const rows = await sql`
    SELECT id, display_linkedin FROM crm_entries
    WHERE user_id = ${userId}
      AND display_linkedin IS NOT NULL
      AND lower(regexp_replace(regexp_replace(display_linkedin, '^https?://', ''), '^www\.', '')) LIKE ${"%" + tail}
    LIMIT 5
  `
  if (!rows.length) return null
  // Prefer the row whose normalized linkedin contains the same slug tail.
  for (const r of rows as any[]) {
    if (normalizeLinkedinUrl(r.display_linkedin).endsWith(tail)) return r.id
  }
  return (rows[0] as any).id
}

function digestForResearchSummary(snippet: any): string {
  const lines: string[] = []
  const ex = snippet?.extracted ?? {}
  if (snippet?.fullName) lines.push(snippet.fullName)
  if (ex.title || ex.firm) lines.push([ex.title, ex.firm].filter(Boolean).join(" · "))
  if (ex.location) lines.push(ex.location)
  if (ex.summary) lines.push(ex.summary)
  if (Array.isArray(ex.pastFirms) && ex.pastFirms.length) {
    lines.push(`Prior: ${ex.pastFirms.slice(0, 4).join(", ")}`)
  }
  return lines.filter(Boolean).join("\n").slice(0, 2000)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const url = String(body?.url ?? "").trim()
    const html = String(body?.html ?? "")
    const finalUrl = String(body?.finalUrl ?? url).trim()
    const status = Number(body?.status ?? 200) || 200
    const source = String(body?.source ?? "chrome-extension").trim() || "chrome-extension"
    const explicitId = body?.crmEntryId ? String(body.crmEntryId) : null
    const createIfMissing = body?.createIfMissing === true
    const boardId = body?.boardId ? String(body.boardId) : null

    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })
    if (!html || html.length < 50) {
      return NextResponse.json({ error: "html required (rendered LinkedIn page)" }, { status: 400 })
    }

    // Parse the snippet using the existing extractor.
    const snippet = await parseProfileSnippetHtml(html, url, finalUrl, status)

    // Add provenance + source tag.
    const persisted = { ...snippet, source }

    // Resolve the target row.
    let crmEntryId: string | null = explicitId
    if (crmEntryId) {
      // Confirm ownership.
      const [row] = await sql`SELECT id FROM crm_entries WHERE id = ${crmEntryId} AND user_id = ${user.id}` as any[]
      if (!row) return NextResponse.json({ error: "crmEntryId not found" }, { status: 404 })
    } else {
      crmEntryId = await findCrmEntryByLinkedin(user.id, url)
    }

    let created = false
    const digest = digestForResearchSummary(persisted)
    const ex = (persisted as any).extracted ?? {}
    const name = (persisted as any).fullName || ex.fullName || (persisted as any).displayLabel || null

    if (!crmEntryId && createIfMissing && name) {
      // No existing contact — mint one from the parsed profile so the import
      // is never a dead end. Source tag keeps it distinguishable in the CRM.
      const canonical = finalUrl || url
      const rows = await sql`
        INSERT INTO crm_entries (
          user_id, source, board_id, display_name, display_title,
          display_linkedin, display_location, display_type,
          research_summary, research_url, linkedin_data, linkedin_data_at,
          stage, added_at, updated_at
        ) VALUES (
          ${user.id}, ${"linkedin-import"}, ${boardId}, ${name}, ${ex.title || null},
          ${canonical}, ${ex.location || null}, ${ex.firm || null},
          ${digest}, ${(persisted as any).finalUrl ?? canonical},
          ${JSON.stringify(persisted)}::jsonb, NOW(),
          ${"queued"}, NOW(), NOW()
        )
        RETURNING id
      ` as any[]
      crmEntryId = rows[0]?.id ?? null
      created = !!crmEntryId
    }

    if (crmEntryId && !created) {
      await sql`
        UPDATE crm_entries SET
          linkedin_data    = ${JSON.stringify(persisted)}::jsonb,
          linkedin_data_at = NOW(),
          research_summary = CASE
            WHEN research_summary IS NULL OR length(trim(research_summary)) = 0
              THEN ${digest}
            ELSE research_summary
          END,
          research_url     = COALESCE(${persisted.finalUrl ?? null}, research_url),
          updated_at       = NOW()
        WHERE id = ${crmEntryId} AND user_id = ${user.id}
      `
    }

    return NextResponse.json({
      crmEntryId,
      snippet: persisted,
      matched: !!crmEntryId && !created,
      created,
      name,
      digest: crmEntryId ? digest : null,
    })
  } catch (e: any) {
    console.error("[linkedin/ingest] error:", e)
    return NextResponse.json({ error: e?.message ?? "ingest failed" }, { status: 500 })
  }
}

/**
 * POST /api/agents/linkedin/ingest-batch
 *
 * Bulk variant of /api/agents/linkedin/ingest.  Lets a Chrome-extension
 * automation feed an entire campaign's worth of captured LinkedIn HTML
 * in one round-trip.
 *
 * Body:
 *   {
 *     items: [
 *       { url, html, finalUrl?, status?, crmEntryId? }
 *     ],
 *     source?: string   // applied to every item (default "chrome-extension")
 *   }
 *
 * Returns a summary + per-item result.  Cap: 100 items per request.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { parseProfileSnippetHtml } from "@/lib/agents/linkedin-public"

export const runtime = "nodejs"
export const maxDuration = 300

const CAP_ITEMS = 100

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
  const rows = await sql`
    SELECT id, display_linkedin FROM crm_entries
    WHERE user_id = ${userId}
      AND display_linkedin IS NOT NULL
      AND lower(regexp_replace(regexp_replace(display_linkedin, '^https?://', ''), '^www\.', '')) LIKE ${"%" + tail}
    LIMIT 5
  `
  if (!rows.length) return null
  for (const r of rows as any[]) {
    if (normalizeLinkedinUrl(r.display_linkedin).endsWith(tail)) return r.id
  }
  return (rows[0] as any).id
}
function digest(snippet: any): string {
  const lines: string[] = []
  const ex = snippet?.extracted ?? {}
  if (snippet?.fullName) lines.push(snippet.fullName)
  if (ex.title || ex.firm) lines.push([ex.title, ex.firm].filter(Boolean).join(" · "))
  if (ex.location) lines.push(ex.location)
  if (ex.summary) lines.push(ex.summary)
  if (Array.isArray(ex.pastFirms) && ex.pastFirms.length) lines.push(`Prior: ${ex.pastFirms.slice(0, 4).join(", ")}`)
  return lines.filter(Boolean).join("\n").slice(0, 2000)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const items: any[] = Array.isArray(body?.items) ? body.items.slice(0, CAP_ITEMS) : []
    const sourceDefault = String(body?.source ?? "chrome-extension")
    if (!items.length) return NextResponse.json({ error: "items[] required" }, { status: 400 })

    const out: any[] = []
    let matched = 0
    let loginWall = 0
    let withName = 0

    for (const it of items) {
      try {
        const url = String(it?.url ?? "").trim()
        const html = String(it?.html ?? "")
        if (!url || !html) { out.push({ url, ok: false, error: "url+html required" }); continue }
        const finalUrl = String(it?.finalUrl ?? url).trim()
        const status = Number(it?.status ?? 200) || 200
        const source = String(it?.source ?? sourceDefault)

        const snippet = await parseProfileSnippetHtml(html, url, finalUrl, status)
        const persisted = { ...snippet, source }
        if (snippet.loginWall) loginWall++
        if (snippet.fullName) withName++

        let crmEntryId: string | null = it?.crmEntryId ? String(it.crmEntryId) : null
        if (crmEntryId) {
          const [row] = await sql`SELECT id FROM crm_entries WHERE id = ${crmEntryId} AND user_id = ${user.id}` as any[]
          if (!row) crmEntryId = null
        }
        if (!crmEntryId) crmEntryId = await findCrmEntryByLinkedin(user.id, url)

        if (crmEntryId) {
          matched++
          const d = digest(persisted)
          await sql`
            UPDATE crm_entries SET
              linkedin_data    = ${JSON.stringify(persisted)}::jsonb,
              linkedin_data_at = NOW(),
              research_summary = CASE
                WHEN research_summary IS NULL OR length(trim(research_summary)) = 0
                  THEN ${d}
                ELSE research_summary
              END,
              research_url     = COALESCE(${persisted.finalUrl ?? null}, research_url),
              updated_at       = NOW()
            WHERE id = ${crmEntryId} AND user_id = ${user.id}
          `
        }

        out.push({
          url, ok: true, crmEntryId, matched: !!crmEntryId,
          fullName: snippet.fullName, headline: snippet.headline,
          loginWall: snippet.loginWall,
          confidence: snippet.extracted?.confidence ?? null,
        })
      } catch (e: any) {
        out.push({ url: it?.url, ok: false, error: e?.message ?? "item failed" })
      }
    }

    return NextResponse.json({
      total: items.length,
      processed: out.length,
      matched,
      loginWall,
      withName,
      items: out,
    })
  } catch (e: any) {
    console.error("[linkedin/ingest-batch] error:", e)
    return NextResponse.json({ error: e?.message ?? "ingest-batch failed" }, { status: 500 })
  }
}

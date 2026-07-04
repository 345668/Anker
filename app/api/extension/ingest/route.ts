/**
 * POST /api/extension/ingest
 *
 * Bearer-token + CORS-friendly variant of /api/agents/linkedin/ingest. The
 * Chrome extension hits THIS route exclusively (the agents-linkedin endpoints
 * stay cookie-auth for the existing paste-HTML dialog and other internal callers).
 *
 * Reuses parseProfileSnippetHtml + the same crm_entries upsert logic.
 *
 * Body: { url, html, finalUrl?, status?, crmEntryId?, source? }
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { parseProfileSnippetHtml } from "@/lib/agents/linkedin-public";
import { normalizeLinkedInUrl } from "@/lib/portfolio/network-graph";
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth";

export const runtime = "nodejs";
export const maxDuration = 90;

function normalize(u: string | null | undefined): string {
  if (!u) return "";
  return String(u).trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

export async function OPTIONS() { return corsOptionsResponse(); }

export async function POST(req: NextRequest) {
  const auth = await authenticateExtension(req);
  if (!auth.ok) return auth.response;

  let body: { url?: string; html?: string; finalUrl?: string; status?: number; crmEntryId?: string; source?: string; degree?: number } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders() });
  }
  const url = String(body.url || "").trim();
  const html = String(body.html || "");
  if (!url || !html) {
    return NextResponse.json({ error: "url + html are required" }, { status: 400, headers: corsHeaders() });
  }
  const source = (body.source || "chrome-extension").toString().slice(0, 60);
  const finalUrl = body.finalUrl || url;
  const status = Number(body.status) || 200;

  // Parse via the existing server-side parser. The extension ships raw HTML,
  // we own variance tolerance here.
  const snippet = await parseProfileSnippetHtml(html, url, finalUrl, status);

  // Find the target row. If crmEntryId supplied use it; otherwise match by
  // normalized display_linkedin.
  let crmEntryId = body.crmEntryId || null;
  if (!crmEntryId) {
    const norm = normalize(url);
    if (norm) {
      const tail = norm.startsWith("linkedin.com/") ? norm.slice("linkedin.com/".length) : norm;
      const rows = await sql`
        select id from crm_entries
        where lower(coalesce(display_linkedin, '')) like ${"%" + tail}
           or lower(coalesce(display_linkedin, '')) like ${"%" + norm}
        order by updated_at desc nulls last
        limit 1
      ` as Array<{ id: string }>;
      crmEntryId = rows[0]?.id ?? null;
    }
  }

  if (!crmEntryId) {
    // Enrich anyway: no CRM match is no longer a dead end. Capture the person
    // as an owner-scoped linkedin_connections row so they appear in the
    // relationship graph and can be promoted to a contact later.
    const connUrl = normalizeLinkedInUrl(finalUrl || url);
    const connName = snippet.fullName || snippet.extracted?.fullName || snippet.displayLabel;
    if (connUrl && connName) {
      const degree = Number(body.degree) >= 1 && Number(body.degree) <= 3 ? Math.floor(Number(body.degree)) : 2;
      await sql`
        insert into linkedin_connections
          (owner_id, linkedin_url, full_name, headline, company, title, degree, raw)
        values (
          ${auth.userId}, ${connUrl}, ${connName}, ${snippet.headline || null},
          ${snippet.extracted?.firm || null}, ${snippet.extracted?.title || null},
          ${degree}, ${JSON.stringify({ source, extracted: snippet.extracted })}::jsonb
        )
        on conflict (owner_id, linkedin_url) do update set
          full_name = excluded.full_name,
          headline  = coalesce(excluded.headline, linkedin_connections.headline),
          company   = coalesce(excluded.company, linkedin_connections.company),
          title     = coalesce(excluded.title, linkedin_connections.title),
          degree    = least(linkedin_connections.degree, excluded.degree),
          raw       = coalesce(excluded.raw, linkedin_connections.raw),
          updated_at = now()
      `;
      return NextResponse.json({
        ok: true,
        reason: "captured_as_connection",
        crmEntryId: null,
        summary: snippet.extracted?.summary || snippet.headline || null,
        extracted: snippet.extracted,
        hint: "No CRM match — saved to your LinkedIn network instead. Visible in the Network graph.",
      }, { status: 200, headers: corsHeaders() });
    }
    return NextResponse.json({
      ok: false,
      reason: "no_match",
      snippet: { extracted: snippet.extracted, displayLabel: snippet.displayLabel },
      hint: "No crm_entries row matched this LinkedIn URL and no name could be parsed.",
    }, { status: 200, headers: corsHeaders() });
  }

  // Persist. Mirrors /api/agents/linkedin/ingest behavior.
  const digest = snippet.extracted?.summary
    || [snippet.extracted?.title, snippet.extracted?.firm].filter(Boolean).join(" at ")
    || snippet.headline
    || null;

  await sql`
    update crm_entries set
      linkedin_data = ${JSON.stringify(snippet)}::jsonb,
      linkedin_data_at = now(),
      research_summary = case
        when coalesce(research_summary, '') = '' and ${digest}::text is not null
          then ${digest}::text
        else research_summary end,
      updated_at = now()
    where id = ${crmEntryId}
  `;

  return NextResponse.json({
    ok: true,
    crmEntryId,
    source,
    summary: digest,
    extracted: snippet.extracted,
    confidence: snippet.extracted?.confidence ?? null,
  }, { headers: corsHeaders() });
}

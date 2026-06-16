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

  let body: { url?: string; html?: string; finalUrl?: string; status?: number; crmEntryId?: string; source?: string } = {};
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
    return NextResponse.json({
      ok: false,
      reason: "no_match",
      snippet: { extracted: snippet.extracted, displayLabel: snippet.displayLabel },
      hint: "No crm_entries row matched this LinkedIn URL. Add the contact to a campaign first.",
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

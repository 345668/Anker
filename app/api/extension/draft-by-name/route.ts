/**
 * GET /api/extension/draft-by-name?firstName=&lastName=&linkedinUrl=&campaignId=
 *
 * Looks up the most recent curated drafts (email_intro + dm_intro) for a
 * recipient. Matches first by LinkedIn URL on crm_entries.display_linkedin,
 * then by case-insensitive first+last name.
 *
 * Returns { subject, body, dm } where:
 *   - subject + body come from outreach_messages WHERE kind = 'email_intro'
 *   - dm comes from outreach_messages WHERE kind = 'dm_intro' (body field)
 *
 * Bearer-token authed. CORS open.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth";

export const runtime = "nodejs";

export async function OPTIONS() { return corsOptionsResponse(); }

function normLinkedin(u: string): string {
  return String(u || "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

interface CrmHit { id: string; display_name: string | null; first_name: string | null; last_name: string | null; }

export async function GET(req: NextRequest) {
  const auth = await authenticateExtension(req);
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const firstName = (sp.get("firstName") || "").trim();
  const lastName  = (sp.get("lastName")  || "").trim();
  const linkedinUrl = (sp.get("linkedinUrl") || "").trim();
  const campaignId  = (sp.get("campaignId")  || "").trim() || null;

  if (!firstName && !linkedinUrl) {
    return NextResponse.json({ error: "Provide at least firstName or linkedinUrl" }, { status: 400, headers: corsHeaders() });
  }

  // Step 1: find the matching crm_entries row for this user.
  let crm: CrmHit | null = null;

  if (linkedinUrl) {
    const norm = normLinkedin(linkedinUrl);
    const tail = norm.startsWith("linkedin.com/") ? norm.slice("linkedin.com/".length) : norm;
    const rows = await sql`
      select id, display_name, first_name, last_name
      from crm_entries
      where user_id = ${auth.userId}
        and (lower(coalesce(display_linkedin, '')) like ${"%" + tail}
          or lower(coalesce(display_linkedin, '')) like ${"%" + norm})
      order by updated_at desc nulls last
      limit 1
    ` as CrmHit[];
    crm = rows[0] ?? null;
  }

  if (!crm && firstName) {
    if (lastName) {
      const rows = await sql`
        select id, display_name, first_name, last_name
        from crm_entries
        where user_id = ${auth.userId}
          and lower(coalesce(first_name, '')) = lower(${firstName})
          and lower(coalesce(last_name, '')) = lower(${lastName})
        order by updated_at desc nulls last
        limit 1
      ` as CrmHit[];
      crm = rows[0] ?? null;
    } else {
      const rows = await sql`
        select id, display_name, first_name, last_name
        from crm_entries
        where user_id = ${auth.userId}
          and lower(coalesce(first_name, '')) = lower(${firstName})
        order by updated_at desc nulls last
        limit 1
      ` as CrmHit[];
      crm = rows[0] ?? null;
    }
  }

  if (!crm) {
    return NextResponse.json({
      found: false,
      hint: "No CRM entry matched this recipient. Add them to a campaign first.",
    }, { headers: corsHeaders() });
  }

  // Step 2: load the email_intro + dm_intro drafts. Optionally filter to a campaign.
  let emailRow: { subject: string | null; body: string | null; campaign_id: string | null } | null = null;
  let dmRow: { body: string | null; campaign_id: string | null } | null = null;

  if (campaignId) {
    const eRows = await sql`
      select m.subject, m.body, cm.campaign_id
      from outreach_messages m
      join outreach_campaign_members cm
        on cm.crm_entry_id = m.crm_entry_id and cm.user_id = m.user_id
      where m.user_id = ${auth.userId}
        and m.crm_entry_id = ${crm.id}
        and m.kind = 'email_intro'
        and cm.campaign_id = ${campaignId}
      order by m.updated_at desc nulls last
      limit 1
    ` as Array<{ subject: string | null; body: string | null; campaign_id: string }>;
    emailRow = eRows[0] ?? null;
    const dRows = await sql`
      select m.body, cm.campaign_id
      from outreach_messages m
      join outreach_campaign_members cm
        on cm.crm_entry_id = m.crm_entry_id and cm.user_id = m.user_id
      where m.user_id = ${auth.userId}
        and m.crm_entry_id = ${crm.id}
        and m.kind = 'dm_intro'
        and cm.campaign_id = ${campaignId}
      order by m.updated_at desc nulls last
      limit 1
    ` as Array<{ body: string; campaign_id: string }>;
    dmRow = dRows[0] ?? null;
  } else {
    const eRows = await sql`
      select subject, body, null::text as campaign_id
      from outreach_messages
      where user_id = ${auth.userId}
        and crm_entry_id = ${crm.id}
        and kind = 'email_intro'
      order by updated_at desc nulls last
      limit 1
    ` as Array<{ subject: string | null; body: string | null; campaign_id: string | null }>;
    emailRow = eRows[0] ?? null;
    const dRows = await sql`
      select body, null::text as campaign_id
      from outreach_messages
      where user_id = ${auth.userId}
        and crm_entry_id = ${crm.id}
        and kind = 'dm_intro'
      order by updated_at desc nulls last
      limit 1
    ` as Array<{ body: string; campaign_id: string | null }>;
    dmRow = dRows[0] ?? null;
  }

  return NextResponse.json({
    found: !!(emailRow || dmRow),
    name: crm.display_name || [crm.first_name, crm.last_name].filter(Boolean).join(" "),
    crmEntryId: crm.id,
    campaignId: emailRow?.campaign_id ?? dmRow?.campaign_id ?? null,
    subject: emailRow?.subject ?? null,
    body: emailRow?.body ?? null,
    dm: dmRow?.body ?? null,
  }, { headers: corsHeaders() });
}

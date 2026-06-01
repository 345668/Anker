/**
 * POST /api/outreach/campaigns/[id]/curate-run
 *
 * Productized port of the SVS Fund II curated-outreach scripts:
 *   1. Tiered web-crawl of each member's firm site (top-N deep + next-N
 *      light; rest = metadata only).  Reuses lib/outreach/curate.ts.
 *   2. Persists the crawl result onto outreach_campaign_members.snapshot
 *      (reused as crawl-data cache) + writes the focus blurb to
 *      crm_entries.research_summary so the rest of the platform picks
 *      it up too.
 *   3. Optionally regenerates first-touch drafts (email + LinkedIn DM)
 *      per LP-type voice rules and upserts them into outreach_messages.
 *
 * Body:
 *   {
 *     tier1Deep?: number       // default 30
 *     tier2Light?: number      // default 100
 *     regenerateDrafts?: boolean   // default true
 *     sender: SenderContext    // see lib/outreach/curate.ts
 *   }
 *
 * Drafts only.  Never sends.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import {
  tieredCrawl, buildMessage, classifyLpType,
  type CurateMember, type SenderContext, type CrawlResult,
} from "@/lib/outreach/curate"

export const runtime = "nodejs"
export const maxDuration = 300

const CAP_MEMBERS = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const tier1Deep = Math.max(0, Math.min(100, Number(body?.tier1Deep ?? 30)))
    const tier2Light = Math.max(0, Math.min(200, Number(body?.tier2Light ?? 100)))
    const regenerateDrafts = body?.regenerateDrafts !== false
    const sender: SenderContext = body?.sender ?? {}

    const [campaign] = await sql`
      SELECT * FROM outreach_campaigns WHERE id = ${id} AND user_id = ${user.id}
    ` as any[]
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

    const rows = await sql`
      SELECT m.id, m.crm_entry_id, m.status,
             e.display_name, e.display_title, e.display_email, e.display_linkedin,
             e.display_location, e.display_type, e.display_score, e.display_tier,
             e.why_match, e.research_summary, e.research_url
      FROM outreach_campaign_members m
      LEFT JOIN crm_entries e ON e.id = m.crm_entry_id AND e.user_id = m.user_id
      WHERE m.campaign_id = ${id} AND m.user_id = ${user.id}
      ORDER BY e.display_score DESC NULLS LAST, m.added_at ASC
      LIMIT ${CAP_MEMBERS}
    `

    const members: CurateMember[] = (rows as any[]).map((r) => ({
      id: r.id,
      crmEntryId: r.crm_entry_id,
      displayName: r.display_name ?? "",
      displayTitle: r.display_title,
      displayEmail: r.display_email,
      displayLinkedin: r.display_linkedin,
      displayLocation: r.display_location,
      displayType: r.display_type,
      displayScore: r.display_score,
      displayTier: r.display_tier,
      whyMatch: r.why_match,
      researchSummary: r.research_summary,
      researchUrl: r.research_url,
      sectorsCsv: null,  // sectors live on investment_firms/investors, not crm_entries directly
      status: r.status,
    }))

    if (!members.length) {
      return NextResponse.json({ error: "Campaign has no members to curate" }, { status: 400 })
    }

    // ── 1. tiered crawl
    const { results: crawls, stats } = await tieredCrawl(members, { tier1Deep, tier2Light })

    // ── 2. persist crawl onto member.snapshot + research_* on crm_entries
    for (const cr of crawls) {
      await sql`
        UPDATE outreach_campaign_members SET
          snapshot = ${JSON.stringify(cr)}::jsonb,
          updated_at = NOW()
        WHERE id = ${cr.memberId} AND user_id = ${user.id}
      `
      // Only write back to crm_entries when the crawl actually produced
      // a useful focus blurb — don't overwrite an existing research
      // summary with a "tier3-no-crawl" placeholder.
      if (cr.ok && (cr.focus || cr.description)) {
        const summary = [cr.focus, cr.description].filter(Boolean).join("\n\n").slice(0, 2000)
        await sql`
          UPDATE crm_entries SET
            research_summary = ${summary},
            research_url     = ${cr.url ?? null},
            research_at      = NOW(),
            updated_at       = NOW()
          WHERE id = ${cr.crmEntryId} AND user_id = ${user.id}
        `
      }
    }

    // ── 3. (optional) regenerate first-touch drafts using the per-LP
    //       voice templates from curate.ts.  Drafts only.
    let drafted = 0
    if (regenerateDrafts) {
      for (const m of members) {
        const msg = buildMessage(m, sender)
        const kindEmail = "email_intro"
        const kindDm = "dm_intro"

        // Email — every bucket gets one.
        await sql`
          INSERT INTO outreach_messages (
            user_id, crm_entry_id, kind, step_number, channel,
            body, subject, email_to, status, generated_by, model_notes, created_at, updated_at
          ) VALUES (
            ${user.id}, ${m.crmEntryId}, ${kindEmail}, 0, 'email',
            ${msg.body}, ${msg.subject}, ${m.displayEmail ?? null}, 'draft',
            'curate:template', ${`campaign:${id} bucket:${msg.bucket}`}, NOW(), NOW()
          )
          ON CONFLICT (crm_entry_id, kind) DO UPDATE SET
            body = EXCLUDED.body, subject = EXCLUDED.subject, email_to = EXCLUDED.email_to,
            channel = EXCLUDED.channel,
            status = CASE WHEN outreach_messages.status IN ('sent','delivered','replied','accepted')
                          THEN outreach_messages.status ELSE 'draft' END,
            generated_by = EXCLUDED.generated_by, model_notes = EXCLUDED.model_notes, updated_at = NOW()
        `

        // DM — only for buckets that produced one (angel).
        if (msg.dm) {
          await sql`
            INSERT INTO outreach_messages (
              user_id, crm_entry_id, kind, step_number, channel,
              body, status, generated_by, model_notes, created_at, updated_at
            ) VALUES (
              ${user.id}, ${m.crmEntryId}, ${kindDm}, 0, 'linkedin',
              ${msg.dm}, 'draft',
              'curate:template', ${`campaign:${id} bucket:${msg.bucket}`}, NOW(), NOW()
            )
            ON CONFLICT (crm_entry_id, kind) DO UPDATE SET
              body = EXCLUDED.body,
              status = CASE WHEN outreach_messages.status IN ('sent','delivered','replied','accepted')
                            THEN outreach_messages.status ELSE 'draft' END,
              generated_by = EXCLUDED.generated_by, model_notes = EXCLUDED.model_notes, updated_at = NOW()
          `
        }
        await sql`
          UPDATE outreach_campaign_members SET
            status = CASE WHEN status IN ('sent','replied') THEN status ELSE 'drafted' END,
            drafted_at = COALESCE(drafted_at, NOW()),
            updated_at = NOW()
          WHERE id = ${m.id} AND user_id = ${user.id}
        `
        drafted++
      }
    }

    await sql`
      UPDATE outreach_campaigns SET
        status = CASE WHEN status = 'draft' AND ${drafted}::int > 0 THEN 'active' ELSE status END,
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.id}
    `

    // Per-LP-type breakdown for the UI summary.
    const breakdown: Record<string, number> = { family_office: 0, angel: 0, institutional: 0, hedge: 0, other: 0 }
    for (const m of members) breakdown[classifyLpType(m.displayType)]++

    return NextResponse.json({
      members: members.length,
      crawl: stats,
      drafted,
      breakdown,
      tier1Deep, tier2Light,
    })
  } catch (e: any) {
    console.error("[curate-run] error:", e)
    return NextResponse.json({ error: e?.message ?? "curate-run failed" }, { status: 500 })
  }
}

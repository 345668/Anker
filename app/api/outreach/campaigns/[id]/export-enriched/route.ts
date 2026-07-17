/**
 * GET /api/outreach/campaigns/[id]/export-enriched
 *
 * Produces an XLSX in the exact SVS_Fund_II_Enriched_Outreach_282 shape
 * so the file can be re-uploaded via /api/outreach/lp-campaign/import
 * OR shared for offline review.
 *
 * Sheets:
 *   1. Overview
 *   2. Curated Profiles (Enriched)   — 26 cols, one row per shortlisted member
 *   3. Email Drafts (Enriched)        — 11 cols, existing drafts + placeholders
 *   4. LinkedIn DMs                    — 7 cols, linkedin-channel members only
 *   5. Campaign Summary                — headline metrics
 *   6. Multi-Touch Tracker             — same-firm co-touches
 *   7. Methodology                     — free text
 *   8. Sender Brief                    — key sender info
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import * as XLSX from "xlsx"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const camp = await sql<any[]>`
    SELECT id, name, event_topic, event_date, event_url
    FROM outreach_campaigns
    WHERE id = ${campaignId} AND user_id = ${user.id}
  `
  if (!camp.length) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
  const c = camp[0]

  // Shortlisted members with enrichment + CRM display fields.
  const rows = await sql<any[]>`
    SELECT
      m.id                        AS member_id,
      m.tier, m.score, m.lp_type, m.tags, m.sectors,
      m.email, m.email_status,
      m.why_this_contact, m.firm_intelligence, m.investment_mandate,
      m.personalisation_hook, m.enriched_subject,
      m.website_url, m.website_title, m.crawl_status, m.multi_touch_note,
      m.snapshot,
      c.display_name, c.display_title, c.display_linkedin,
      c.display_location
    FROM outreach_campaign_members m
    JOIN crm_entries c ON c.id = m.crm_entry_id
    WHERE m.campaign_id = ${campaignId} AND m.user_id = ${user.id}
      AND m.selected = true
    ORDER BY m.score DESC NULLS LAST, m.id
  `

  // Fetch matching drafts from outreach_messages (subject / body per member).
  const drafts = await sql<any[]>`
    SELECT om.crm_entry_id, om.channel, om.subject, om.body
    FROM outreach_messages om
    JOIN outreach_campaign_members m ON m.crm_entry_id = om.crm_entry_id
    WHERE m.campaign_id = ${campaignId} AND m.user_id = ${user.id}
      AND om.user_id = ${user.id}
  `
  // Index drafts by crm_entry_id + channel
  const draftMap = new Map<string, { subject: string | null; body: string | null; channel: string | null }>()
  for (const d of drafts) {
    const key = `${d.crm_entry_id}:${d.channel || "email"}`
    if (!draftMap.has(key)) {
      draftMap.set(key, { subject: d.subject, body: d.body, channel: d.channel })
    }
  }

  // ── Sheet 1: Overview
  const overview: (string | null)[][] = [
    ["Campaign", c.name],
    ["Generated", new Date().toISOString().slice(0, 10)],
    ["Event topic", c.event_topic || ""],
    ["Event date", c.event_date ? String(c.event_date) : ""],
    ["RSVP URL", c.event_url || ""],
    ["Shortlisted count", String(rows.length)],
  ]

  // ── Sheet 2: Curated Profiles (Enriched) — 26 cols
  const profileHeaders = [
    "#", "Tier", "Score", "Name", "Title/Role", "LP Type", "Tags", "Location",
    "Email", "LinkedIn", "Sectors", "Why This Contact", "Inferred Website",
    "Crawl Status", "Website Title", "Investment Focus (extracted)",
    "Meta Description", "Other Emails on Site", "Crawl Paths Tried",
    "Firm Intelligence", "Investment Mandate", "Personalisation Hook",
    "Enriched Subject", "Multi-Touch Note", "Batch", "Outreach Status",
  ]
  const profileRows: any[][] = [profileHeaders]
  rows.forEach((r, i) => {
    profileRows.push([
      i + 1,
      r.tier || "",
      r.score ?? "",
      r.display_name,
      r.display_title || "",
      r.lp_type || "",
      r.tags || "",
      r.display_location || "",
      r.email || "",
      r.display_linkedin || "",
      r.sectors || "",
      r.why_this_contact || "",
      r.website_url || "",
      r.crawl_status || "",
      r.website_title || "",
      "",  // Investment Focus (extracted) — reserved for future
      "",  // Meta Description
      "",  // Other Emails on Site
      "",  // Crawl Paths Tried
      r.firm_intelligence || "",
      r.investment_mandate || "",
      r.personalisation_hook || "",
      r.enriched_subject || "",
      r.multi_touch_note || "",
      "",  // Batch
      "",  // Outreach Status
    ])
  })

  // ── Sheet 3: Email Drafts (Enriched)
  const emailHeaders = [
    "#", "Name", "LP Type", "Email", "Subject", "Body",
    "Primary channel", "Voice notes", "Enriched Subject", "Batch", "Multi-Touch Note",
  ]
  const emailRows: any[][] = [emailHeaders]
  rows.forEach((r, i) => {
    const draft = draftMap.get(`${r.member_id.split(":")[0]}:email`) || draftMap.get(`${r.member_id}:email`)
    emailRows.push([
      i + 1,
      r.display_name,
      r.lp_type || "",
      r.email || "",
      draft?.subject || r.enriched_subject || "",
      draft?.body || "",
      "email",
      "",
      r.enriched_subject || "",
      "",
      r.multi_touch_note || "",
    ])
  })

  // ── Sheet 4: LinkedIn DMs
  const dmHeaders = ["#", "Name", "LP Type", "LinkedIn URL", "DM (first touch)", "Chars", "Voice notes"]
  const dmRows: any[][] = [dmHeaders]
  let dmIdx = 1
  for (const r of rows) {
    if (!r.display_linkedin) continue
    const draft = draftMap.get(`${r.member_id}:linkedin`)
    if (!draft?.body) continue
    dmRows.push([
      dmIdx++,
      r.display_name,
      r.lp_type || "",
      r.display_linkedin,
      draft.body,
      draft.body.length,
      "",
    ])
  }

  // ── Sheet 5: Campaign Summary
  const summaryRows: any[][] = [
    ["Metric", "Value", "Notes"],
    ["Total shortlisted", rows.length, ""],
    ["With email", rows.filter((r) => r.email).length, ""],
    ["Verified (valid)", rows.filter((r) => r.email_status === "valid").length, ""],
    ["T1", rows.filter((r) => r.tier === "t1").length, ""],
    ["T2", rows.filter((r) => r.tier === "t2").length, ""],
    ["T3", rows.filter((r) => r.tier === "t3").length, ""],
  ]

  // ── Sheet 6: Multi-Touch Tracker
  const mtHeaders = ["#", "Name", "Multi-Touch Note", "Batch"]
  const mtRows: any[][] = [mtHeaders]
  rows.forEach((r, i) => {
    if (r.multi_touch_note) mtRows.push([i + 1, r.display_name, r.multi_touch_note, ""])
  })

  // ── Sheet 7: Methodology + Sheet 8: Sender Brief (plain text blocks)
  const methRows: any[][] = [
    [`Methodology — ${c.name}`],
    [""],
    ["Scoring: IP-topic model (see lib/outreach/scoring.ts)"],
    ["Enrichment: batched 15/call via configured AI provider"],
    ["Verification: regex + role drop + prior-bounce cross-ref + DNS MX"],
    [""],
    ["Generated from Campaign Builder in the deployed Anker app."],
  ]
  const brief: any[][] = [
    ["Sender Brief", ""],
    ["Campaign", c.name],
    ["Event topic", c.event_topic || ""],
    ["Event date", c.event_date ? String(c.event_date) : ""],
    ["RSVP URL", c.event_url || ""],
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overview), "Overview")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(profileRows), "Curated Profiles (Enriched)")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(emailRows), "Email Drafts (Enriched)")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dmRows), "LinkedIn DMs")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Campaign Summary")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mtRows), "Multi-Touch Tracker")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(methRows), "Methodology")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(brief), "Sender Brief")

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  const safeName = (c.name || "campaign").replace(/[^A-Za-z0-9_-]+/g, "_")

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}_Enriched.xlsx"`,
    },
  })
}

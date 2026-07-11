/**
 * POST /api/outreach/campaigns/[id]/score-shortlist
 *
 * Scores every member of the campaign pool using the IP-topic model,
 * enforces the LP-mix targets + tier bands, and marks the winners.
 *
 * Body:
 *   { target?: 500,
 *     mix?: { family_office?: 0.6, hnw_angel?: 0.3, mfo_ifo?: 0.1, ... },
 *     tierBands?: { t1Cap?: 100, t2Min?: 60 } }
 *
 * Returns:
 *   { ok, scored, selected, byTier: {t1,t2,t3}, byLpType: {...} }
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { scoreContact, pickShortlist, type LpType, type ScoringCandidate } from "@/lib/outreach/scoring"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const camp = await sql<any[]>`
    SELECT id FROM outreach_campaigns WHERE id = ${campaignId} AND user_id = ${user.id}
  `
  if (!camp.length) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const target = Number(body.target ?? 500)
  const mix = body.mix || undefined
  const tierBands = body.tierBands || undefined

  // Pull members with their snapshot + email + prior touch signals.
  // Prior touch = latest outreach_messages row for this crm_entry_id
  // across ALL campaigns (not just this one), so we know cold vs warm.
  const members = await sql<any[]>`
    SELECT
      m.id                                     AS member_id,
      m.crm_entry_id                           AS crm_entry_id,
      m.snapshot                               AS snapshot,
      m.email                                  AS email,
      c.display_name                           AS display_name,
      c.display_linkedin                       AS display_linkedin,
      c.display_location                       AS display_location,
      c.linkedin_data                          AS linkedin_data,
      -- Prior touch signals from any past outreach
      EXISTS (
        SELECT 1 FROM outreach_messages om
        WHERE om.crm_entry_id = m.crm_entry_id AND om.replied_at IS NOT NULL
      ) AS previously_replied,
      EXISTS (
        SELECT 1 FROM outreach_messages om
        WHERE om.crm_entry_id = m.crm_entry_id AND om.opened_at IS NOT NULL
      ) AS previously_opened,
      EXISTS (
        SELECT 1 FROM outreach_messages om
        WHERE om.crm_entry_id = m.crm_entry_id AND om.bounced_at IS NOT NULL
      ) AS previously_bounced,
      EXISTS (
        SELECT 1 FROM outreach_messages om
        WHERE om.crm_entry_id = m.crm_entry_id AND om.sent_at IS NOT NULL
      ) AS previously_sent
    FROM outreach_campaign_members m
    JOIN crm_entries c ON c.id = m.crm_entry_id
    WHERE m.campaign_id = ${campaignId} AND m.user_id = ${user.id}
  `

  if (!members.length) {
    return NextResponse.json({ ok: true, scored: 0, selected: 0, byTier: { t1: 0, t2: 0, t3: 0 }, byLpType: {} })
  }

  // Score each in memory, then persist.
  const scored = members.map((m) => {
    const snap = (m.snapshot || {}) as Record<string, unknown>
    const ld = (m.linkedin_data || {}) as Record<string, unknown>
    const cand: ScoringCandidate = {
      lp_type: (snap.lp_type as string) || null,
      sectors: (snap.sectors as string) || null,
      location: m.display_location || (snap.location as string) || null,
      headline: (ld.headline as string) || (snap.headline as string) || null,
      title:    (ld.title as string)    || (snap.title as string)    || null,
      firm:     (ld.company as string)  || (snap.firm as string)     || null,
      email:    m.email || null,
      linkedin_url: m.display_linkedin || (snap.linkedin_url as string) || null,
      degree:   (snap.degree as number | string) ?? null,
      tags:     (snap.tags as string | null) ?? null,
      previously_replied: !!m.previously_replied,
      previously_opened:  !!m.previously_opened,
      previously_bounced: !!m.previously_bounced,
      previously_sent:    !!m.previously_sent,
    }
    const r = scoreContact(cand)
    return {
      memberId: m.member_id as string,
      score: r.total,
      lpType: r.derivedLpType,
      details: r.details,
    }
  })

  // Pick shortlist
  const picks = pickShortlist(
    scored.map(({ memberId, score, lpType }) => ({ id: memberId, score, lpType })),
    { target, mix, tierBands },
  )
  const pickById = new Map(picks.map((p) => [p.id, p]))

  // Persist scores for ALL members; selected flag + tier for winners.
  await sql`UPDATE outreach_campaign_members SET selected = false, tier = null WHERE campaign_id = ${campaignId}`
  for (const s of scored) {
    const pick = pickById.get(s.memberId)
    await sql`
      UPDATE outreach_campaign_members
      SET score = ${s.score},
          lp_type = ${s.lpType},
          score_details = ${JSON.stringify(s.details)}::jsonb,
          selected = ${!!pick},
          tier = ${pick?.tier ?? null}
      WHERE id = ${s.memberId}
    `
  }

  // Persist config on the campaign for audit + re-runs.
  await sql`
    UPDATE outreach_campaigns
    SET shortlist_config = ${JSON.stringify({ target, mix, tierBands })}::jsonb,
        updated_at = NOW()
    WHERE id = ${campaignId}
  `

  const byTier = { t1: 0, t2: 0, t3: 0 }
  const byLpType: Record<string, number> = {}
  for (const p of picks) {
    byTier[p.tier]++
    byLpType[p.lpType] = (byLpType[p.lpType] || 0) + 1
  }

  return NextResponse.json({
    ok: true,
    scored: scored.length,
    selected: picks.length,
    byTier,
    byLpType,
  })
}

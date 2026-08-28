/**
 * LinkedOut analytics — the outreach funnel.
 *
 * Per-campaign (and rolled-up) funnel: enrolled → connects sent → accepted →
 * messages sent → replied, plus operational counts (pending approval, failed).
 * All derived from li_action_queue + li_campaign_members — no new writes.
 */
import "server-only"
import { sql } from "@/lib/db"

export interface CampaignFunnel {
  campaignId: string
  name: string
  status: string
  enrolled: number
  connectsSent: number
  accepted: number
  messagesSent: number
  replied: number
  pending: number
  failed: number
  /** accepted / connectsSent (0..1), null when no connects sent. */
  acceptRate: number | null
  /** replied / (accepted || connectsSent) (0..1), null when denominator 0. */
  replyRate: number | null
}

export interface FunnelReport {
  campaigns: CampaignFunnel[]
  totals: {
    campaigns: number
    enrolled: number
    connectsSent: number
    accepted: number
    messagesSent: number
    replied: number
    pending: number
    failed: number
    acceptRate: number | null
    replyRate: number | null
  }
}

const rate = (num: number, den: number): number | null => (den > 0 ? num / den : null)

export async function campaignFunnels(userId: string): Promise<FunnelReport> {
  const camps = (await sql`
    SELECT id, name, status FROM li_campaigns
    WHERE user_id = ${userId} AND status <> 'archived'
    ORDER BY created_at DESC
  `) as any[]

  const mem = (await sql`
    SELECT campaign_id,
           COUNT(*)::int AS enrolled,
           COUNT(*) FILTER (WHERE accepted_at IS NOT NULL)::int AS accepted,
           COUNT(*) FILTER (WHERE state = 'replied')::int AS replied
    FROM li_campaign_members WHERE user_id = ${userId} GROUP BY campaign_id
  `) as any[]

  const act = (await sql`
    SELECT campaign_id,
           COUNT(*) FILTER (WHERE action_type = 'connect_request' AND status = 'done')::int AS connects,
           COUNT(*) FILTER (WHERE action_type IN ('message','follow_up') AND status = 'done')::int AS messages,
           COUNT(*) FILTER (WHERE status = 'pending_approval')::int AS pending,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM li_action_queue WHERE user_id = ${userId} AND campaign_id IS NOT NULL GROUP BY campaign_id
  `) as any[]

  const memBy = new Map(mem.map((r) => [String(r.campaign_id), r]))
  const actBy = new Map(act.map((r) => [String(r.campaign_id), r]))

  const campaigns: CampaignFunnel[] = camps.map((c) => {
    const m = memBy.get(String(c.id))
    const a = actBy.get(String(c.id))
    const enrolled = Number(m?.enrolled ?? 0)
    const accepted = Number(m?.accepted ?? 0)
    const replied = Number(m?.replied ?? 0)
    const connectsSent = Number(a?.connects ?? 0)
    const messagesSent = Number(a?.messages ?? 0)
    const pending = Number(a?.pending ?? 0)
    const failed = Number(a?.failed ?? 0)
    return {
      campaignId: String(c.id), name: c.name, status: c.status,
      enrolled, connectsSent, accepted, messagesSent, replied, pending, failed,
      acceptRate: rate(accepted, connectsSent),
      replyRate: rate(replied, accepted || connectsSent),
    }
  })

  const sum = (k: keyof CampaignFunnel) => campaigns.reduce((n, c) => n + (Number(c[k]) || 0), 0)
  const tConnects = sum("connectsSent"), tAccepted = sum("accepted"), tReplied = sum("replied")
  const totals = {
    campaigns: campaigns.length,
    enrolled: sum("enrolled"),
    connectsSent: tConnects,
    accepted: tAccepted,
    messagesSent: sum("messagesSent"),
    replied: tReplied,
    pending: sum("pending"),
    failed: sum("failed"),
    acceptRate: rate(tAccepted, tConnects),
    replyRate: rate(tReplied, tAccepted || tConnects),
  }

  return { campaigns, totals }
}

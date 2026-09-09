import { sql } from "@/lib/db"
import { resolveActiveMembership } from "@/lib/org/active"
import { resolveWorkspaceFund } from "@/lib/auth/fund-access"

/** Personal CRM and fund deal flow are distinct datasets; never read legacy global deals. */
export async function getHomeData(userId: string) {
  const { active } = await resolveActiveMembership(userId)
  const fund = active?.persona === "vc" ? await resolveWorkspaceFund(userId) : null
  const isFund = active?.persona === "vc"
  const pipelineHref = isFund ? "/dashboard/portfolio/fund/deals" : "/dashboard/fundraising/pipeline"
  const available = active?.persona === "founder" || !!fund
  let aggregate: any = {}, recent: any[] = []
  if (fund) {
    const [totals, rows] = await Promise.all([
      sql`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE stage NOT IN ('closed','passed'))::int active,
        COUNT(*) FILTER (WHERE stage = 'closed')::int won,
        COALESCE(SUM(proposed_check) FILTER (WHERE stage NOT IN ('closed','passed')),0) pipeline,
        COALESCE(SUM(proposed_check) FILTER (WHERE stage = 'closed'),0) closed
        FROM deal_opportunities WHERE fund_id = ${fund.id}`,
      sql`SELECT id, company_name name, stage, proposed_check amount, updated_at FROM deal_opportunities
        WHERE fund_id = ${fund.id} ORDER BY updated_at DESC, id LIMIT 5`,
    ])
    aggregate = totals[0] ?? {}; recent = rows
  } else if (active?.persona === "founder") {
    const [totals, rows] = await Promise.all([
      sql`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE stage NOT IN ('committed','passed'))::int active,
        COUNT(*) FILTER (WHERE stage = 'committed')::int won,
        COALESCE(SUM(check_size) FILTER (WHERE stage NOT IN ('committed','passed')),0) pipeline,
        COALESCE(SUM(check_size) FILTER (WHERE stage = 'committed'),0) closed
        FROM crm_entries WHERE user_id = ${userId}`,
      sql`SELECT id, display_name name, stage, check_size amount, updated_at FROM crm_entries
        WHERE user_id = ${userId} ORDER BY updated_at DESC, id LIMIT 5`,
    ])
    aggregate = totals[0] ?? {}; recent = rows
  }
  const [contacts] = await sql`SELECT COUNT(*)::int total FROM crm_entries WHERE user_id = ${userId}`
  return {
    totalFirms: 0, totalInvestors: 0, totalContacts: Number(contacts?.total ?? 0),
    totalDeals: Number(aggregate.total ?? 0), activeDeals: Number(aggregate.active ?? 0),
    closedDeals: Number(aggregate.won ?? 0), pipelineValue: Number(aggregate.pipeline ?? 0), closedValue: Number(aggregate.closed ?? 0),
    recentDeals: recent.map((r: any) => ({ id: r.id, name: r.name, stage: r.stage, amount: r.amount == null ? null : Number(r.amount), firmName: null, updatedAt: r.updated_at ? String(r.updated_at) : null })),
    pipelineHref, pipelineAvailable: available, currency: fund?.currency ?? null,
    scope: fund ? `${active?.name} · ${fund.name}. Contacts are your personal CRM records.` : active?.persona === "founder" ? "Your personal raise pipeline and CRM records, across boards. Check sizes have no recorded currency and are shown without a currency symbol." : "Select a configured workspace to view its pipeline. Contacts are your personal CRM records.",
  }
}

import type { LpMembership } from "@/lib/portfolio/data-room"
import type { LpPortfolioSummary } from "@/components/lp/lp-dashboard-client"

/** Missing currencies remain separated by fund; missing NAV never becomes zero. */
export function summarizeLpPortfolio(memberships: LpMembership[], values: Record<string, number | null>): LpPortfolioSummary[] {
  const groups = new Map<string, LpPortfolioSummary>()
  for (const m of memberships) {
    const currency = m.currency || null
    const key = currency || `unknown:${m.fund_id}`
    const group = groups.get(key) ?? { key, label: currency ? `Capital account · ${currency}` : `${m.fund_name} · currency not recorded`, currency, committed: 0, called: 0, uncalled: 0, distributed: 0, estNav: 0, tvpi: null }
    group.committed = group.committed == null || m.commitment_amount == null ? null : group.committed + m.commitment_amount
    group.called += m.called_amount
    group.uncalled = group.uncalled == null || m.commitment_amount == null ? null : group.uncalled + Math.max(0, m.commitment_amount - m.called_amount)
    group.distributed += m.distributed_amount
    const nav = values[m.fund_lp_id]
    group.estNav = group.estNav == null || nav == null ? null : group.estNav + nav
    group.tvpi = group.called > 0 && group.estNav != null ? (group.distributed + group.estNav) / group.called : null
    groups.set(key, group)
  }
  return [...groups.values()]
}

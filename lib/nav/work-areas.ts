import type { Persona } from "@/lib/org/active"

/** Responsibility-based presentation of the canonical route catalog. */
export const WORK_AREAS: Record<Persona, [string, string[]][]> = {
  founder: [
    ["Fundraising", ["/dashboard/fundraising/pipeline", "/dashboard/discover", "/dashboard/find-investors", "/dashboard/signals"]],
    ["Relationships", ["/dashboard/crm", "/dashboard/network", "/dashboard/calls", "/dashboard/updates"]],
    ["Outreach", ["/dashboard/outreach", "/dashboard/linkedin/campaigns", "/dashboard/linkedin/leads", "/dashboard/linkedin/unibox", "/dashboard/linkedin/review", "/dashboard/linkedin/senders", "/dashboard/linkedin/analytics", "/dashboard/linkedin/suppression", "/dashboard/linkedin/extension"]],
    ["Company", ["/dashboard/cap-table", "/dashboard/runway", "/dashboard/share-plans", "/dashboard/valuations-409a", "/dashboard/compensation", "/dashboard/equity-compliance", "/dashboard/term-sheet", "/dashboard/tools", "/dashboard/analytics"]],
    ["Documents", ["/dashboard/data-room", "/dashboard/decks", "/dashboard/documents"]],
    ["Assistant", ["/dashboard/assistant", "/dashboard/anker-ai"]],
  ],
  vc: [
    ["Deals", ["/dashboard/portfolio/fund/deals", "/dashboard/campaigns", "/dashboard/calls"]],
    ["Portfolio", ["/dashboard/portfolio", "/dashboard/valuations", "/dashboard/forecasting"]],
    ["Investors", ["/dashboard/crm", "/dashboard/discover", "/dashboard/matchmaking", "/dashboard/network", "/dashboard/outreach", "/dashboard/outreach/lp-campaign", "/dashboard/linkedin/campaigns", "/dashboard/linkedin/leads", "/dashboard/linkedin/unibox", "/dashboard/linkedin/review", "/dashboard/linkedin/senders", "/dashboard/linkedin/analytics", "/dashboard/linkedin/suppression", "/dashboard/linkedin/extension"]],
    ["Fund operations", ["/dashboard/portfolio/fund", "/dashboard/kyc-aml", "/dashboard/fund-tax", "/dashboard/spvs", "/dashboard/loan-operations", "/dashboard/contracts", "/dashboard/portfolio/compliance"]],
    ["Reporting", ["/dashboard/portfolio/fund/performance", "/dashboard/portfolio/fund/reports", "/dashboard/portfolio/fund/explorer", "/dashboard/portfolio/fund/tear-sheet", "/dashboard/decks", "/dashboard/documents", "/dashboard/tools", "/dashboard/analytics"]],
    ["Assistant", ["/dashboard/assistant", "/dashboard/anker-ai"]],
  ],
  lp: [["Capital activity", ["/lp/distributions"]], ["Documents", ["/lp/documents", "/lp/calls"]]],
}

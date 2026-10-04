/** Which module a dashboard path belongs to, so a plan without it can hide the way in. Longest prefix wins; unlisted paths belong to no module. */
import type { FeatureKey } from "./model"

const MAP: Array<[string, FeatureKey]> = [
  ["/dashboard/portfolio/fund/intake", "intake"],
  ["/dashboard/portfolio/fund/deals", "deals"],
  ["/dashboard/portfolio/compliance", "fund_ops"],
  ["/dashboard/portfolio/fund", "fund_ops"],
  ["/dashboard/assistant", "assistant"],
  ["/dashboard/anker-ai", "assistant"],
  ["/dashboard/outreach", "outreach"],
  ["/dashboard/send-center", "outreach"],
  ["/dashboard/linkedin", "linkedin"],
  ["/dashboard/matchmaking", "matchmaking"],
  ["/dashboard/tools", "tools"],
  ["/dashboard/spvs", "spvs"],
  ["/dashboard/kyc-aml", "fund_ops"],
  ["/dashboard/fund-tax", "fund_ops"],
  ["/dashboard/loan-operations", "fund_ops"],
]
const SORTED = [...MAP].sort((a, b) => b[0].length - a[0].length)

export function featureForPath(pathname: string | null | undefined): FeatureKey | null {
  const p = String(pathname ?? "").split("?")[0].replace(/\/$/, "")
  for (const [prefix, feature] of SORTED) if (p === prefix || p.startsWith(prefix + "/")) return feature
  return null
}

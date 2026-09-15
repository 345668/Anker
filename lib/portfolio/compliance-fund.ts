import { requireActiveFund } from "@/lib/auth/fund-access"

/** Compatibility helper: only the active authorized fund, never a seeded default. */
export async function resolveComplianceFundId(input: string | null): Promise<string | null> {
  const fund = await requireActiveFund()
  if (input !== null && ![fund.id, fund.slug].includes(input.trim())) return null
  return fund.id
}

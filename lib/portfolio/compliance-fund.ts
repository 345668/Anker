/**
 * Resolve a compliance fund id. The compliance tables FK to funds(id) (TEXT),
 * but callers may pass a slug or nothing (defaults to the flagship fund).
 * Lazily seeds the flagship if it doesn't exist yet, mirroring the fund page.
 */
import { getFundById, getFundBySlug, createFund } from "@/lib/portfolio/funds"

const FLAGSHIP_SLUG = "svs-fund-ii"

export async function resolveComplianceFundId(input: string | null): Promise<string | null> {
  const candidate = (input || "").trim()
  if (candidate) {
    const byId = await getFundById(candidate)
    if (byId) return byId.id
    const bySlug = await getFundBySlug(candidate)
    if (bySlug) return bySlug.id
  }
  // fall back to the flagship, lazily creating it so the page never 500s
  let fund = await getFundBySlug(FLAGSHIP_SLUG)
  if (!fund) {
    fund = await createFund({
      name: "Summit Venture Studio — Fund II",
      slug: FLAGSHIP_SLUG,
      currency: "USD",
      status: "fundraising",
      managerOrg: "Summit Venture Studio",
      vintageYear: new Date().getUTCFullYear(),
    })
  }
  return fund?.id ?? null
}

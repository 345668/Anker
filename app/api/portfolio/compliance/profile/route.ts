/**
 * POST /api/portfolio/compliance/profile — save the fund's intake answers.
 * Body: { fundId?, ...profile fields }. Validated against allowed enums.
 * Admin-gated. Feature adapted from Hemrock Portfolio Reporting (Apache-2.0).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { upsertFundProfile } from "@/lib/portfolio/compliance"
import { resolveComplianceFundId } from "@/lib/portfolio/compliance-fund"

export const runtime = "nodejs"

const VALID = {
  registration_status: ["ria", "era", "not_registered", "unsure"],
  aum_range: ["under_25m", "25m_100m", "100m_150m", "150m_500m", "500m_1.5b", "over_1.5b", "unsure"],
  fund_structure: ["lp", "llc_partnership", "llc_corp", "other"],
  fundraising_status: ["actively_raising", "closed_recent", "closed_over_12m", "evergreen"],
  reg_d_exemption: ["506b", "506c", "no", "unsure"],
  investor_state_count: ["single_state", "2_to_5", "6_to_15", "16_plus", "unsure"],
  public_equity: ["yes_over_100m", "yes_under_100m", "yes_5pct_single", "no", "unsure"],
  cftc_activity: ["yes_with_exemption", "yes_no_exemption", "no", "unsure"],
  access_person_count: ["1_to_3", "4_to_10", "11_plus"],
  has_foreign_entities: ["yes", "no"],
  has_foreign_investors: ["yes", "no", "unsure"],
} as const

const VALID_CA_NEXUS = ["hq_ca", "investors_ca", "investments_ca", "fundraising_ca", "none"]

function pick(v: unknown, allowed: readonly string[]): string | null {
  return typeof v === "string" && allowed.includes(v) ? v : null
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  let body: any = {}
  try { body = await req.json() } catch {}
  const fundId = await resolveComplianceFundId(body?.fundId ?? null)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })

  const california_nexus = Array.isArray(body.california_nexus)
    ? body.california_nexus.filter((v: unknown) => typeof v === "string" && VALID_CA_NEXUS.includes(v as string)).slice(0, 10)
    : null

  await upsertFundProfile(fundId, {
    registration_status: pick(body.registration_status, VALID.registration_status),
    aum_range: pick(body.aum_range, VALID.aum_range),
    fund_structure: pick(body.fund_structure, VALID.fund_structure),
    fundraising_status: pick(body.fundraising_status, VALID.fundraising_status),
    reg_d_exemption: pick(body.reg_d_exemption, VALID.reg_d_exemption),
    investor_state_count: pick(body.investor_state_count, VALID.investor_state_count),
    california_nexus,
    public_equity: pick(body.public_equity, VALID.public_equity),
    cftc_activity: pick(body.cftc_activity, VALID.cftc_activity),
    access_person_count: pick(body.access_person_count, VALID.access_person_count),
    has_foreign_entities: pick(body.has_foreign_entities, VALID.has_foreign_entities),
    has_foreign_investors: pick(body.has_foreign_investors, VALID.has_foreign_investors),
  })
  return NextResponse.json({ ok: true })
}

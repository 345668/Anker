import type { FundProfileV2 } from "./v2/types"
export function stringList(value: unknown): string[] {
  if (typeof value === "string") { try { value = JSON.parse(value) } catch { return [] } }
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && !!v.trim()) : []
}
export function toFundProfile(row: any): FundProfileV2 {
  const list = (key: string, legacy: string) => { const values = stringList(row[key]); return values.length ? values : stringList(row[legacy]) }
  return {
    id: row.id, name: row.name || row.fund_name || "", fundNumber: row.fund_number ?? undefined,
    targetRaise: row.target_raise == null ? (row.target_fund_size == null ? null : Number(row.target_fund_size)) : Number(row.target_raise),
    averageTicket: row.average_ticket == null ? null : Number(row.average_ticket),
    sectors: list("sectors", "target_sectors"), primarySectors: stringList(row.primary_sectors),
    geographicFocus: list("geographic_focus", "target_geographies"), headquartersLocation: row.headquarters_location ?? null,
    thesisKeywords: stringList(row.thesis_keywords), scoringMode: "svs_absolute",
    fundIPriorLpFirmIds: stringList(row.fund_i_prior_lp_firm_ids), fundIPriorContactEmails: stringList(row.fund_i_prior_contact_emails),
  }
}

export function serializeFundProfile(r: any) {
  return {
    id: r.id,
    name: r.name,
    fundNumber: r.fund_number ?? null,
    targetRaise: numOrNull(r.target_raise),
    averageTicket: numOrNull(r.average_ticket),
    avgCheckSize: numOrNull(r.avg_check_size),
    hardCap: numOrNull(r.hard_cap),
    minimumCommitment: numOrNull(r.minimum_commitment),
    fundLife: numOrNull(r.fund_life),
    managementFee: numOrNull(r.management_fee),
    carry: numOrNull(r.carry),
    gpCommitment: numOrNull(r.gp_commitment),
    investmentStage: r.investment_stage ?? null,
    targetCompanies: numOrNull(r.target_companies),
    investmentPeriod: numOrNull(r.investment_period),
    sectors: parseJsonField(r.sectors),
    primarySectors: parseJsonField(r.primary_sectors),
    geographicFocus: parseJsonField(r.geographic_focus),
    headquartersLocation: r.headquarters_location ?? null,
    targetLpTypes: parseJsonField(r.target_lp_types),
    thesisKeywords: parseJsonField(r.thesis_keywords),
    thesisDescription: r.thesis_description ?? null,
    valueProposition: r.value_proposition ?? null,
    gpName: r.gp_name ?? null,
    portfolioCompanies: parseJsonField(r.portfolio_companies),
    isActive: !!r.is_active,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  }
}

function numOrNull(v: any): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function parseJsonField(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[]
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}
function toIso(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

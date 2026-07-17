/**
 * Portfolio tracker queries.
 *
 * Two tables, one module:
 *
 *   portfolio_companies        — listCompanies, getById, getBySlug,
 *                                createCompany, updateCompany, deleteCompany
 *   portfolio_kpis_monthly     — listKpis, upsertKpiSnapshot, getLatestKpi
 *
 * Naming convention mirrors lib/newsroom/queries.ts:
 *  - module owns its own types (PortfolioCompanyFull, KpiSnapshot)
 *  - all writes return the canonical post-write row via RETURNING
 *  - normalize() centralises the SQL-row → TS-object conversion so
 *    callers don't worry about numeric strings vs numbers
 */

import { sql } from "@/lib/db"
import { slugify, ensureUniqueSlug } from "@/lib/newsroom/slug"

export const COMPANY_STATUSES = ["active", "exited", "written_off", "on_watch"] as const
export type CompanyStatus = (typeof COMPANY_STATUSES)[number]

export const KPI_SOURCES = ["manual", "founder_form", "import_xlsx", "api", "email_update"] as const
export type KpiSource = (typeof KPI_SOURCES)[number]

export interface PortfolioCompanyFull {
  id: string
  fund_id: string
  name: string
  slug: string
  website: string | null
  linkedin_url: string | null
  one_liner: string | null
  description: string | null
  sector: string | null
  sub_sector: string | null
  geography: string | null
  stage: string | null
  founded_year: number | null
  first_check_at: string | null
  first_check_amount: number | null
  total_invested_amount: number | null
  ownership_pct: number | null
  last_round_at: string | null
  last_round_name: string | null
  last_round_valuation: number | null
  status: CompanyStatus
  owner_user_id: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface KpiSnapshot {
  id: string
  company_id: string
  month_end: string  // ISO date
  cash_balance: number | null
  monthly_burn: number | null
  runway_months: number | null
  monthly_revenue: number | null
  revenue_growth_mom: number | null
  gross_margin_pct: number | null
  headcount: number | null
  customers: number | null
  arr: number | null
  notes: string | null
  source: KpiSource
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── COMPANIES ────────────────────────────────────────────────────────────

export interface ListCompaniesOpts {
  fundId?: string                // defaults to 'svs-fund-ii'
  status?: CompanyStatus | "all"
  sector?: string | "all"
  query?: string                 // free-text on name + one_liner
  limit?: number
  offset?: number
}

export async function listCompanies(opts: ListCompaniesOpts = {}): Promise<{
  rows: PortfolioCompanyFull[]
  total: number
}> {
  const fundId = opts.fundId ?? "svs-fund-ii"
  const status = opts.status ?? "all"
  const sector = opts.sector ?? "all"
  const query = (opts.query ?? "").trim()
  const limit = Math.max(1, Math.min(500, opts.limit ?? 100))
  const offset = Math.max(0, opts.offset ?? 0)

  // We build a parameterised statement via sql.unsafe to keep the WHERE
  // assembly clean. Mirrors the listAll() pattern in lib/newsroom/queries.ts.
  const where: string[] = ["fund_id = $1"]
  const params: any[] = [fundId]
  if (status !== "all") { params.push(status); where.push(`status = $${params.length}`) }
  if (sector !== "all") { params.push(sector); where.push(`sector = $${params.length}`) }
  if (query) {
    params.push(`%${query}%`)
    where.push(`(name ILIKE $${params.length} OR one_liner ILIKE $${params.length})`)
  }
  const whereSql = `WHERE ${where.join(" AND ")}`

  const rows: any[] = await sql.unsafe(
    `SELECT id, fund_id, name, slug, website, linkedin_url, one_liner, description,
            sector, sub_sector, geography, stage, founded_year,
            first_check_at, first_check_amount, total_invested_amount, ownership_pct,
            last_round_at, last_round_name, last_round_valuation,
            status, owner_user_id, metadata, created_at, updated_at
       FROM portfolio_companies
       ${whereSql}
       ORDER BY status ASC, last_round_at DESC NULLS LAST, name ASC
       LIMIT ${limit} OFFSET ${offset}`,
    params,
  )
  const totalRows: any[] = await sql.unsafe(
    `SELECT COUNT(*) AS n FROM portfolio_companies ${whereSql}`,
    params,
  )
  return {
    rows: rows.map(normalizeCompany),
    total: Number(totalRows[0]?.n ?? 0),
  }
}

export async function getCompanyById(id: string): Promise<PortfolioCompanyFull | null> {
  const rows = await sql`SELECT * FROM portfolio_companies WHERE id = ${id} LIMIT 1`
  return rows[0] ? normalizeCompany(rows[0]) : null
}

export async function getCompanyBySlug(
  fundId: string,
  slug: string,
): Promise<PortfolioCompanyFull | null> {
  const rows = await sql`
    SELECT * FROM portfolio_companies WHERE fund_id = ${fundId} AND slug = ${slug} LIMIT 1
  `
  return rows[0] ? normalizeCompany(rows[0]) : null
}

export interface CreateCompanyInput {
  fundId?: string
  name: string
  /** Optional — derived from name if not supplied. Unique per fund_id. */
  slug?: string | null
  website?: string | null
  linkedinUrl?: string | null
  oneLiner?: string | null
  description?: string | null
  sector?: string | null
  subSector?: string | null
  geography?: string | null
  stage?: string | null
  foundedYear?: number | null
  firstCheckAt?: string | null
  firstCheckAmount?: number | null
  totalInvestedAmount?: number | null
  ownershipPct?: number | null
  lastRoundAt?: string | null
  lastRoundName?: string | null
  lastRoundValuation?: number | null
  status?: CompanyStatus
  ownerUserId?: string | null
  metadata?: Record<string, any>
}

export async function createCompany(input: CreateCompanyInput): Promise<PortfolioCompanyFull> {
  if (!input?.name?.trim()) throw new Error("name required")
  const fundId = input.fundId ?? "svs-fund-ii"
  const baseSlug = slugify(input.slug?.trim() || input.name.trim())
  const slug = await ensureUniqueSlug(baseSlug, async (s) => {
    const rows = await sql`
      SELECT 1 FROM portfolio_companies WHERE fund_id = ${fundId} AND slug = ${s} LIMIT 1
    `
    return rows.length > 0
  })

  const meta = JSON.stringify(input.metadata ?? {})
  const rows = await sql`
    INSERT INTO portfolio_companies (
      fund_id, name, slug, website, linkedin_url, one_liner, description,
      sector, sub_sector, geography, stage, founded_year,
      first_check_at, first_check_amount, total_invested_amount, ownership_pct,
      last_round_at, last_round_name, last_round_valuation,
      status, owner_user_id, metadata, created_at, updated_at
    ) VALUES (
      ${fundId}, ${input.name.trim()}, ${slug},
      ${input.website ?? null}, ${input.linkedinUrl ?? null},
      ${input.oneLiner ?? null}, ${input.description ?? null},
      ${input.sector ?? null}, ${input.subSector ?? null}, ${input.geography ?? null},
      ${input.stage ?? null}, ${input.foundedYear ?? null},
      ${input.firstCheckAt ?? null}::date, ${input.firstCheckAmount ?? null},
      ${input.totalInvestedAmount ?? null}, ${input.ownershipPct ?? null},
      ${input.lastRoundAt ?? null}::date, ${input.lastRoundName ?? null},
      ${input.lastRoundValuation ?? null},
      ${input.status ?? "active"}, ${input.ownerUserId ?? null},
      ${meta}::jsonb, NOW(), NOW()
    )
    RETURNING *
  `
  return normalizeCompany(rows[0])
}

export interface UpdateCompanyInput {
  name?: string
  slug?: string | null
  website?: string | null
  linkedinUrl?: string | null
  oneLiner?: string | null
  description?: string | null
  sector?: string | null
  subSector?: string | null
  geography?: string | null
  stage?: string | null
  foundedYear?: number | null
  firstCheckAt?: string | null
  firstCheckAmount?: number | null
  totalInvestedAmount?: number | null
  ownershipPct?: number | null
  lastRoundAt?: string | null
  lastRoundName?: string | null
  lastRoundValuation?: number | null
  status?: CompanyStatus
  ownerUserId?: string | null
  metadata?: Record<string, any>
}

export async function updateCompany(
  id: string,
  patch: UpdateCompanyInput,
): Promise<PortfolioCompanyFull | null> {
  const metaJson = patch.metadata !== undefined ? JSON.stringify(patch.metadata) : null

  // Slug update logic — same pattern as newsroom queries.
  let newSlug: string | null = null
  if (typeof patch.slug === "string") {
    const current = await getCompanyById(id)
    if (!current) return null
    const source = patch.slug.trim() || patch.name?.trim() || current.name
    const base = slugify(source)
    newSlug = await ensureUniqueSlug(base, async (s) => {
      const rows = await sql`
        SELECT 1 FROM portfolio_companies
         WHERE fund_id = ${current.fund_id} AND slug = ${s} AND id <> ${id} LIMIT 1
      `
      return rows.length > 0
    })
  }

  const rows = await sql`
    UPDATE portfolio_companies SET
      name                   = COALESCE(${patch.name ?? null}, name),
      slug                   = COALESCE(${newSlug}, slug),
      website                = COALESCE(${patch.website ?? null}, website),
      linkedin_url           = COALESCE(${patch.linkedinUrl ?? null}, linkedin_url),
      one_liner              = COALESCE(${patch.oneLiner ?? null}, one_liner),
      description            = COALESCE(${patch.description ?? null}, description),
      sector                 = COALESCE(${patch.sector ?? null}, sector),
      sub_sector             = COALESCE(${patch.subSector ?? null}, sub_sector),
      geography              = COALESCE(${patch.geography ?? null}, geography),
      stage                  = COALESCE(${patch.stage ?? null}, stage),
      founded_year           = COALESCE(${patch.foundedYear ?? null}, founded_year),
      first_check_at         = COALESCE(${patch.firstCheckAt ?? null}::date, first_check_at),
      first_check_amount     = COALESCE(${patch.firstCheckAmount ?? null}, first_check_amount),
      total_invested_amount  = COALESCE(${patch.totalInvestedAmount ?? null}, total_invested_amount),
      ownership_pct          = COALESCE(${patch.ownershipPct ?? null}, ownership_pct),
      last_round_at          = COALESCE(${patch.lastRoundAt ?? null}::date, last_round_at),
      last_round_name        = COALESCE(${patch.lastRoundName ?? null}, last_round_name),
      last_round_valuation   = COALESCE(${patch.lastRoundValuation ?? null}, last_round_valuation),
      status                 = COALESCE(${patch.status ?? null}, status),
      owner_user_id          = COALESCE(${patch.ownerUserId ?? null}, owner_user_id),
      metadata               = CASE WHEN ${metaJson}::text IS NOT NULL THEN ${metaJson}::jsonb ELSE metadata END,
      updated_at             = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return rows[0] ? normalizeCompany(rows[0]) : null
}

export async function deleteCompany(id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM portfolio_companies WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

// ── KPIs ─────────────────────────────────────────────────────────────────

export async function listKpis(
  companyId: string,
  limit = 24,
): Promise<KpiSnapshot[]> {
  const rows = await sql`
    SELECT * FROM portfolio_kpis_monthly
     WHERE company_id = ${companyId}
     ORDER BY month_end DESC
     LIMIT ${limit}
  `
  return rows.map(normalizeKpi)
}

export async function getLatestKpi(companyId: string): Promise<KpiSnapshot | null> {
  const rows = await sql`
    SELECT * FROM portfolio_kpis_monthly
     WHERE company_id = ${companyId}
     ORDER BY month_end DESC
     LIMIT 1
  `
  return rows[0] ? normalizeKpi(rows[0]) : null
}

export interface UpsertKpiInput {
  companyId: string
  monthEnd: string                // ISO date "YYYY-MM-DD" — coerced to last-of-month server-side
  cashBalance?: number | null
  monthlyBurn?: number | null
  runwayMonths?: number | null    // optional — auto-derived when null and cash+burn present
  monthlyRevenue?: number | null
  revenueGrowthMom?: number | null
  grossMarginPct?: number | null
  headcount?: number | null
  customers?: number | null
  arr?: number | null
  notes?: string | null
  source?: KpiSource
  createdBy?: string | null
}

export async function upsertKpiSnapshot(input: UpsertKpiInput): Promise<KpiSnapshot> {
  if (!input.companyId) throw new Error("companyId required")
  if (!input.monthEnd) throw new Error("monthEnd required")

  // Auto-derive runway when not supplied but cash+burn are.
  let runway = input.runwayMonths ?? null
  if (
    runway == null
    && typeof input.cashBalance === "number"
    && typeof input.monthlyBurn === "number"
    && input.monthlyBurn > 0
  ) {
    runway = Math.round((input.cashBalance / input.monthlyBurn) * 10) / 10
  }

  // Coerce the input date to the last day of its month — keeps the
  // (company_id, month_end) UNIQUE constraint stable regardless of whether
  // the caller passed the 1st, 15th, or last.
  const monthEnd = lastOfMonth(input.monthEnd)

  const rows = await sql`
    INSERT INTO portfolio_kpis_monthly (
      company_id, month_end,
      cash_balance, monthly_burn, runway_months,
      monthly_revenue, revenue_growth_mom, gross_margin_pct,
      headcount, customers, arr, notes, source,
      created_by, created_at, updated_at
    ) VALUES (
      ${input.companyId}, ${monthEnd}::date,
      ${input.cashBalance ?? null}, ${input.monthlyBurn ?? null}, ${runway},
      ${input.monthlyRevenue ?? null}, ${input.revenueGrowthMom ?? null}, ${input.grossMarginPct ?? null},
      ${input.headcount ?? null}, ${input.customers ?? null}, ${input.arr ?? null},
      ${input.notes ?? null}, ${input.source ?? "manual"},
      ${input.createdBy ?? null}, NOW(), NOW()
    )
    ON CONFLICT (company_id, month_end) DO UPDATE SET
      cash_balance       = EXCLUDED.cash_balance,
      monthly_burn       = EXCLUDED.monthly_burn,
      runway_months      = EXCLUDED.runway_months,
      monthly_revenue    = EXCLUDED.monthly_revenue,
      revenue_growth_mom = EXCLUDED.revenue_growth_mom,
      gross_margin_pct   = EXCLUDED.gross_margin_pct,
      headcount          = EXCLUDED.headcount,
      customers          = EXCLUDED.customers,
      arr                = EXCLUDED.arr,
      notes              = EXCLUDED.notes,
      source             = EXCLUDED.source,
      updated_at         = NOW()
    RETURNING *
  `
  return normalizeKpi(rows[0])
}

export async function deleteKpiSnapshot(companyId: string, monthEnd: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM portfolio_kpis_monthly
     WHERE company_id = ${companyId} AND month_end = ${lastOfMonth(monthEnd)}::date
     RETURNING id
  `
  return rows.length > 0
}

// ── helpers ──────────────────────────────────────────────────────────────

function normalizeCompany(r: any): PortfolioCompanyFull {
  return {
    id: r.id,
    fund_id: r.fund_id,
    name: r.name,
    slug: r.slug,
    website: r.website ?? null,
    linkedin_url: r.linkedin_url ?? null,
    one_liner: r.one_liner ?? null,
    description: r.description ?? null,
    sector: r.sector ?? null,
    sub_sector: r.sub_sector ?? null,
    geography: r.geography ?? null,
    stage: r.stage ?? null,
    founded_year: r.founded_year != null ? Number(r.founded_year) : null,
    first_check_at: toIsoDate(r.first_check_at),
    first_check_amount: toNum(r.first_check_amount),
    total_invested_amount: toNum(r.total_invested_amount),
    ownership_pct: toNum(r.ownership_pct),
    last_round_at: toIsoDate(r.last_round_at),
    last_round_name: r.last_round_name ?? null,
    last_round_valuation: toNum(r.last_round_valuation),
    status: (r.status ?? "active") as CompanyStatus,
    owner_user_id: r.owner_user_id ?? null,
    metadata: parseJsonObj(r.metadata),
    created_at: toIso(r.created_at) ?? new Date().toISOString(),
    updated_at: toIso(r.updated_at) ?? new Date().toISOString(),
  }
}

function normalizeKpi(r: any): KpiSnapshot {
  return {
    id: r.id,
    company_id: r.company_id,
    month_end: toIsoDate(r.month_end) ?? "",
    cash_balance: toNum(r.cash_balance),
    monthly_burn: toNum(r.monthly_burn),
    runway_months: toNum(r.runway_months),
    monthly_revenue: toNum(r.monthly_revenue),
    revenue_growth_mom: toNum(r.revenue_growth_mom),
    gross_margin_pct: toNum(r.gross_margin_pct),
    headcount: r.headcount != null ? Number(r.headcount) : null,
    customers: r.customers != null ? Number(r.customers) : null,
    arr: toNum(r.arr),
    notes: r.notes ?? null,
    source: (r.source ?? "manual") as KpiSource,
    created_by: r.created_by ?? null,
    created_at: toIso(r.created_at) ?? new Date().toISOString(),
    updated_at: toIso(r.updated_at) ?? new Date().toISOString(),
  }
}

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function toIso(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}
function toIsoDate(v: any): string | null {
  const iso = toIso(v)
  if (!iso) return null
  return iso.slice(0, 10)  // YYYY-MM-DD
}
function parseJsonObj(v: any): Record<string, any> {
  if (!v) return {}
  if (typeof v === "object" && !Array.isArray(v)) return v
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v)
      return p && typeof p === "object" && !Array.isArray(p) ? p : {}
    } catch { return {} }
  }
  return {}
}
function lastOfMonth(iso: string): string {
  // Accepts "YYYY-MM-DD" or full ISO; returns YYYY-MM-DD for the last
  // day of that calendar month.
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const eom = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  return eom.toISOString().slice(0, 10)
}

// ── analytics rollups for dashboard cards ────────────────────────────────

export interface PortfolioRollup {
  total: number
  active: number
  exited: number
  written_off: number
  on_watch: number
  total_invested: number      // USD across active + on_watch positions
  total_value_at_last_round: number  // last-round-valuation × ownership_pct, summed
}

export async function getPortfolioRollup(
  fundId = "svs-fund-ii",
): Promise<PortfolioRollup> {
  const rows = await sql`
    SELECT
      COUNT(*)                                                             AS total,
      COUNT(*) FILTER (WHERE status = 'active')                            AS active,
      COUNT(*) FILTER (WHERE status = 'exited')                            AS exited,
      COUNT(*) FILTER (WHERE status = 'written_off')                       AS written_off,
      COUNT(*) FILTER (WHERE status = 'on_watch')                          AS on_watch,
      COALESCE(SUM(total_invested_amount)
        FILTER (WHERE status IN ('active', 'on_watch')), 0)                AS total_invested,
      COALESCE(SUM(last_round_valuation * ownership_pct)
        FILTER (WHERE status IN ('active', 'on_watch')
                AND last_round_valuation IS NOT NULL
                AND ownership_pct IS NOT NULL), 0)                         AS total_value_at_last_round
    FROM portfolio_companies
    WHERE fund_id = ${fundId}
  `
  const r: any = rows[0] ?? {}
  return {
    total: Number(r.total ?? 0),
    active: Number(r.active ?? 0),
    exited: Number(r.exited ?? 0),
    written_off: Number(r.written_off ?? 0),
    on_watch: Number(r.on_watch ?? 0),
    total_invested: Number(r.total_invested ?? 0),
    total_value_at_last_round: Number(r.total_value_at_last_round ?? 0),
  }
}

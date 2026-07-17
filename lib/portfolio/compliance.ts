/**
 * Compliance module — the regulatory-obligation register for a fund.
 *
 * A fund answers a short intake profile (registration status, AUM, structure,
 * Reg D, foreign investors…). Those answers drive an applicability engine that,
 * per catalog item, returns applies / not_applicable / needs_review / monitor.
 * The team can override applicability, dismiss items, and generate dated
 * deadline instances per year whose status they track to filed.
 *
 * Four tables (see scripts/migrations/2026-07-17-compliance.sql):
 *   compliance_items          global catalog (reference data, TEXT id)
 *   fund_compliance_profile   per-fund intake answers
 *   compliance_fund_settings  per-fund per-item overrides
 *   compliance_deadlines      per-fund per-item per-year instances
 *
 * The catalog + applicability rules are adapted from Hemrock Portfolio
 * Reporting (Apache-2.0); see NOTICE.
 */

import { sql } from "@/lib/db"

// ── types ─────────────────────────────────────────────────────────────────

export type Applicability =
  | "applies"
  | "not_applicable"
  | "needs_review"
  | "monitor"
  | "completed"

export const DEADLINE_STATUSES = [
  "upcoming",
  "in_progress",
  "filed",
  "extended",
  "overdue",
  "not_applicable",
] as const
export type DeadlineStatus = (typeof DEADLINE_STATUSES)[number]

export interface ComplianceProfile {
  registration_status: string | null
  aum_range: string | null
  fund_structure: string | null
  fundraising_status: string | null
  reg_d_exemption: string | null
  investor_state_count: string | null
  california_nexus: string[] | null
  public_equity: string | null
  cftc_activity: string | null
  access_person_count: string | null
  has_foreign_entities: string | null
  has_foreign_investors: string | null
}

export interface ComplianceItem {
  id: string
  category: string
  name: string
  short_name: string
  description: string
  frequency: string
  deadline_description: string
  deadline_month: number | null
  deadline_day: number | null
  rolling_days: number | null
  applicability_text: string
  applicability_question: string
  filing_system: string
  filing_portal_url: string | null
  regulation_url: string | null
  complexity: string
  notes: string | null
  alert: string | null
  sort_order: number
}

export interface ComplianceSetting {
  compliance_item_id: string
  applies: string | null
  dismissed: boolean
  dismissed_reason: string | null
  notes: string | null
}

export interface ComplianceDeadline {
  id: string
  compliance_item_id: string
  year: number
  due_date: string | null
  status: DeadlineStatus
  filed_date: string | null
  filing_reference: string | null
  notes: string | null
}

// ── applicability engine (ported from Hemrock, Apache-2.0) ─────────────────

type Rule = (p: ComplianceProfile) => { result: Applicability; reason: string }

const RULES: Record<string, Rule> = {
  "form-adv": (p) => {
    if (p.registration_status === "ria" || p.registration_status === "era")
      return { result: "applies", reason: `Firm is registered as ${p.registration_status === "ria" ? "an RIA" : "an ERA"}` }
    if (p.registration_status === "not_registered")
      return { result: "not_applicable", reason: "Firm is not registered with the SEC" }
    return { result: "needs_review", reason: "Registration status is unclear" }
  },
  "form-pf": (p) => {
    if (p.registration_status === "era") return { result: "not_applicable", reason: "ERAs are exempt from Form PF" }
    if (p.registration_status === "not_registered") return { result: "not_applicable", reason: "Firm is not registered with the SEC" }
    const bigAum = ["150m_500m", "500m_1.5b", "over_1.5b"]
    const smallAum = ["under_25m", "25m_100m", "100m_150m"]
    if (p.registration_status === "ria" && p.aum_range && bigAum.includes(p.aum_range))
      return { result: "applies", reason: "RIA with $150M+ in private fund AUM" }
    if (p.aum_range && smallAum.includes(p.aum_range)) return { result: "not_applicable", reason: "AUM below $150M threshold" }
    return { result: "needs_review", reason: "Registration status or AUM range is unclear" }
  },
  "form-13f": (p) => {
    if (p.public_equity === "yes_over_100m") return { result: "applies", reason: "Holds $100M+ in public equities" }
    if (p.public_equity === "no") return { result: "not_applicable", reason: "Fund holds no public equities" }
    if (p.public_equity === "yes_under_100m") return { result: "not_applicable", reason: "Public equity holdings under $100M" }
    return { result: "needs_review", reason: "Public equity holdings status is unclear" }
  },
  "sched-13g": (p) => {
    if (p.public_equity === "yes_5pct_single") return { result: "applies", reason: "Holds 5%+ of a single public company" }
    if (p.public_equity === "no") return { result: "not_applicable", reason: "Fund holds no public equities" }
    return { result: "needs_review", reason: "Public equity holdings status is unclear" }
  },
  "form-13h": (p) => {
    if (p.public_equity === "no") return { result: "not_applicable", reason: "Fund holds no public equities" }
    return { result: "needs_review", reason: "Rarely triggered for VC funds — review large trader thresholds" }
  },
  "form-npx": (p) => {
    if (p.public_equity === "yes_over_100m") return { result: "applies", reason: "Required because firm files Form 13F" }
    if (p.public_equity === "no" || p.public_equity === "yes_under_100m")
      return { result: "not_applicable", reason: "Form 13F not required" }
    return { result: "needs_review", reason: "Depends on Form 13F filing obligation" }
  },
  "form-d": (p) => {
    if (p.reg_d_exemption === "506b" || p.reg_d_exemption === "506c")
      return { result: "applies", reason: `Fund raised capital under Reg D (Rule ${p.reg_d_exemption === "506b" ? "506(b)" : "506(c)"})` }
    if (p.reg_d_exemption === "no") return { result: "not_applicable", reason: "Fund did not raise capital under Reg D" }
    return { result: "needs_review", reason: "Reg D exemption status is unclear" }
  },
  "form-d-amendment-review": (p) => {
    if (p.reg_d_exemption === "506b" || p.reg_d_exemption === "506c")
      return { result: "applies", reason: "Fund filed Form D — annual amendment review required" }
    if (p.reg_d_exemption === "no") return { result: "not_applicable", reason: "Fund did not raise capital under Reg D" }
    return { result: "needs_review", reason: "Reg D exemption status is unclear" }
  },
  "blue-sky": (p) => {
    if (p.reg_d_exemption === "no") return { result: "not_applicable", reason: "Fund did not raise capital under Reg D" }
    if ((p.reg_d_exemption === "506b" || p.reg_d_exemption === "506c") && p.investor_state_count !== "single_state")
      return { result: "applies", reason: "Fund raised under Reg D with investors in multiple states" }
    if (p.investor_state_count === "single_state") return { result: "not_applicable", reason: "Investors in only one state" }
    return { result: "needs_review", reason: "Reg D or investor geography status is unclear" }
  },
  "cftc-exemption": (p) => {
    if (p.cftc_activity === "yes_with_exemption") return { result: "applies", reason: "CPO exemption filed with NFA" }
    if (p.cftc_activity === "no") return { result: "not_applicable", reason: "No commodity/futures/swap activity" }
    if (p.cftc_activity === "yes_no_exemption")
      return { result: "needs_review", reason: "Commodity activity exists but no exemption filed — may need to register" }
    return { result: "needs_review", reason: "CFTC activity status is unclear" }
  },
  "ca-diversity": (p) => {
    const nexus = p.california_nexus ?? []
    if (nexus.length > 0 && !nexus.includes("none")) return { result: "applies", reason: "Firm has California nexus" }
    if (nexus.includes("none")) return { result: "not_applicable", reason: "No California connection" }
    return { result: "needs_review", reason: "California nexus has not been assessed" }
  },
  "tax-1065": (p) => partnershipRule(p),
  "tax-7004": (p) => partnershipRule(p),
  "schedule-k1": (p) => partnershipRule(p, "K-1s required for all partners"),
  "quarterly-disclosures": (p) => {
    if (p.registration_status === "ria" || p.registration_status === "era")
      return { result: "applies", reason: "Required for registered advisers" }
    if (p.registration_status === "not_registered") return { result: "not_applicable", reason: "Firm is not registered with the SEC" }
    return { result: "needs_review", reason: "Registration status is unclear" }
  },
  "annual-compliance-review": (p) => {
    if (p.registration_status === "ria") return { result: "applies", reason: "Required for SEC-registered RIAs" }
    if (p.registration_status === "era") return { result: "needs_review", reason: "Not legally required for ERAs, but best practice" }
    if (p.registration_status === "not_registered") return { result: "not_applicable", reason: "Firm is not registered with the SEC" }
    return { result: "needs_review", reason: "Registration status is unclear" }
  },
  "privacy-notice": (p) => {
    if (p.registration_status === "ria") return { result: "applies", reason: "Required for SEC-registered RIAs" }
    if (p.registration_status === "era" || p.registration_status === "not_registered")
      return { result: "not_applicable", reason: "Not required for ERAs or unregistered firms" }
    return { result: "needs_review", reason: "Registration status is unclear" }
  },
  "aml-program": () => ({ result: "monitor", reason: "Effective date postponed to January 1, 2028 — prepare and monitor" }),
  "boi-report": (p) => {
    if (p.has_foreign_entities === "yes") return { result: "applies", reason: "Fund has foreign-formed entities registered in the U.S." }
    if (p.has_foreign_entities === "no") return { result: "not_applicable", reason: "All entities are U.S.-formed (exempt since March 2025)" }
    return { result: "needs_review", reason: "Foreign entity status has not been assessed" }
  },
  "quarterly-financial-reporting": () => ({ result: "applies", reason: "Required for all funds with LP reporting obligations per LPA" }),
  "valuations-soi": () => ({ result: "applies", reason: "Required for all funds that report NAV or FMV to LPs" }),
  "partnership-expenses": (p) => {
    if (p.fund_structure === "lp" || p.fund_structure === "llc_partnership")
      return { result: "applies", reason: "Fund is a partnership — quarterly expense allocation review recommended" }
    return { result: "needs_review", reason: "Fund structure is unclear — review LPA expense provisions" }
  },
  "annual-fund-audit": () => ({ result: "applies", reason: "Required for most funds per LPA — confirm with your LPA" }),
  "fatca-crs": (p) => {
    if (p.has_foreign_investors === "yes") return { result: "applies", reason: "Fund has foreign investors — FATCA withholding and reporting required" }
    if (p.has_foreign_investors === "no") return { result: "not_applicable", reason: "All investors are U.S. persons" }
    return { result: "needs_review", reason: "Foreign investor status has not been assessed" }
  },
  "insurance-eo": () => ({ result: "needs_review", reason: "Review whether your firm carries E&O / Professional Liability insurance" }),
  "insurance-do": () => ({ result: "needs_review", reason: "Review whether your firm carries D&O liability insurance" }),
  "insurance-cyber": () => ({ result: "needs_review", reason: "Review whether your firm carries Cyber Liability insurance" }),
}

function partnershipRule(p: ComplianceProfile, extra = ""): { result: Applicability; reason: string } {
  const suffix = extra ? ` — ${extra}` : ""
  if (p.fund_structure === "lp" || p.fund_structure === "llc_partnership")
    return { result: "applies", reason: `Fund is structured as a partnership${suffix}` }
  if (p.fund_structure === "llc_corp") return { result: "not_applicable", reason: "LLC taxed as corporation" }
  return { result: "needs_review", reason: "Fund structure is unclear" }
}

const EMPTY_PROFILE: ComplianceProfile = {
  registration_status: null, aum_range: null, fund_structure: null, fundraising_status: null,
  reg_d_exemption: null, investor_state_count: null, california_nexus: null, public_equity: null,
  cftc_activity: null, access_person_count: null, has_foreign_entities: null, has_foreign_investors: null,
}

export function evaluateApplicability(itemId: string, profile: ComplianceProfile): { result: Applicability; reason: string } {
  const rule = RULES[itemId]
  if (!rule) return { result: "needs_review", reason: "No applicability rule defined" }
  return rule(profile)
}

// ── queries ────────────────────────────────────────────────────────────────

export async function getComplianceItems(): Promise<ComplianceItem[]> {
  const rows = await sql`
    select id, category, name, short_name, description, frequency, deadline_description,
           deadline_month, deadline_day, rolling_days, applicability_text, applicability_question,
           filing_system, filing_portal_url, regulation_url, complexity, notes, alert, sort_order
    from compliance_items order by sort_order
  `
  return rows as ComplianceItem[]
}

export async function getFundProfile(fundId: string): Promise<ComplianceProfile & { completed_at: string | null }> {
  const rows = await sql`select * from fund_compliance_profile where fund_id = ${fundId}`
  if (!rows.length) return { ...EMPTY_PROFILE, completed_at: null }
  const r = rows[0] as any
  return {
    registration_status: r.registration_status, aum_range: r.aum_range, fund_structure: r.fund_structure,
    fundraising_status: r.fundraising_status, reg_d_exemption: r.reg_d_exemption,
    investor_state_count: r.investor_state_count, california_nexus: r.california_nexus,
    public_equity: r.public_equity, cftc_activity: r.cftc_activity, access_person_count: r.access_person_count,
    has_foreign_entities: r.has_foreign_entities, has_foreign_investors: r.has_foreign_investors,
    completed_at: r.completed_at,
  }
}

export async function upsertFundProfile(fundId: string, p: Partial<ComplianceProfile>): Promise<void> {
  const nexus = Array.isArray(p.california_nexus) ? p.california_nexus : null
  await sql`
    insert into fund_compliance_profile (
      fund_id, registration_status, aum_range, fund_structure, fundraising_status,
      reg_d_exemption, investor_state_count, california_nexus, public_equity, cftc_activity,
      access_person_count, has_foreign_entities, has_foreign_investors, completed_at, updated_at
    ) values (
      ${fundId}, ${p.registration_status ?? null}, ${p.aum_range ?? null}, ${p.fund_structure ?? null},
      ${p.fundraising_status ?? null}, ${p.reg_d_exemption ?? null}, ${p.investor_state_count ?? null},
      ${nexus}, ${p.public_equity ?? null}, ${p.cftc_activity ?? null}, ${p.access_person_count ?? null},
      ${p.has_foreign_entities ?? null}, ${p.has_foreign_investors ?? null}, now(), now()
    )
    on conflict (fund_id) do update set
      registration_status = excluded.registration_status, aum_range = excluded.aum_range,
      fund_structure = excluded.fund_structure, fundraising_status = excluded.fundraising_status,
      reg_d_exemption = excluded.reg_d_exemption, investor_state_count = excluded.investor_state_count,
      california_nexus = excluded.california_nexus, public_equity = excluded.public_equity,
      cftc_activity = excluded.cftc_activity, access_person_count = excluded.access_person_count,
      has_foreign_entities = excluded.has_foreign_entities, has_foreign_investors = excluded.has_foreign_investors,
      completed_at = now(), updated_at = now()
  `
}

export async function getFundSettings(fundId: string): Promise<ComplianceSetting[]> {
  const rows = await sql`
    select compliance_item_id, applies, dismissed, dismissed_reason, notes
    from compliance_fund_settings where fund_id = ${fundId}
  `
  return rows as ComplianceSetting[]
}

export async function upsertSetting(
  fundId: string,
  itemId: string,
  patch: { applies?: string | null; dismissed?: boolean; dismissed_reason?: string | null; notes?: string | null },
): Promise<void> {
  await sql`
    insert into compliance_fund_settings (fund_id, compliance_item_id, applies, dismissed, dismissed_reason, notes, updated_at)
    values (${fundId}, ${itemId}, ${patch.applies ?? null}, ${patch.dismissed ?? false},
            ${patch.dismissed_reason ?? null}, ${patch.notes ?? null}, now())
    on conflict (fund_id, compliance_item_id) do update set
      applies = coalesce(${patch.applies ?? null}, compliance_fund_settings.applies),
      dismissed = ${patch.dismissed ?? false},
      dismissed_reason = ${patch.dismissed_reason ?? null},
      notes = coalesce(${patch.notes ?? null}, compliance_fund_settings.notes),
      updated_at = now()
  `
}

export async function getDeadlines(fundId: string, year: number): Promise<ComplianceDeadline[]> {
  const rows = await sql`
    select id, compliance_item_id, year, to_char(due_date,'YYYY-MM-DD') as due_date, status,
           to_char(filed_date,'YYYY-MM-DD') as filed_date, filing_reference, notes
    from compliance_deadlines where fund_id = ${fundId} and year = ${year}
    order by due_date nulls last
  `
  return rows as ComplianceDeadline[]
}

/**
 * Generate (or refresh) dated deadline rows for a year, one per applicable item
 * that has a fixed month/day. Items already generated are left untouched so we
 * don't clobber a status the team has advanced. Returns the count created.
 */
export async function generateDeadlines(fundId: string, year: number): Promise<number> {
  const [items, profile, settings] = await Promise.all([
    getComplianceItems(),
    getFundProfile(fundId),
    getFundSettings(fundId),
  ])
  const settingById = new Map(settings.map((s) => [s.compliance_item_id, s]))
  let created = 0
  for (const item of items) {
    if (item.deadline_month == null || item.deadline_day == null) continue
    const s = settingById.get(item.id)
    if (s?.dismissed) continue
    const applicability = s?.applies === "yes" ? "applies"
      : s?.applies === "no" ? "not_applicable"
      : evaluateApplicability(item.id, profile).result
    if (applicability === "not_applicable") continue
    const due = `${year}-${String(item.deadline_month).padStart(2, "0")}-${String(item.deadline_day).padStart(2, "0")}`
    const res = await sql`
      insert into compliance_deadlines (fund_id, compliance_item_id, year, due_date, status, updated_at)
      values (${fundId}, ${item.id}, ${year}, ${due}, 'upcoming', now())
      on conflict (fund_id, compliance_item_id, year) do nothing
      returning id
    `
    if (res.length) created++
  }
  return created
}

export async function updateDeadline(
  fundId: string,
  deadlineId: string,
  patch: { status?: DeadlineStatus; filed_date?: string | null; filing_reference?: string | null; notes?: string | null },
): Promise<void> {
  await sql`
    update compliance_deadlines set
      status = coalesce(${patch.status ?? null}, status),
      filed_date = ${patch.filed_date ?? null},
      filing_reference = coalesce(${patch.filing_reference ?? null}, filing_reference),
      notes = coalesce(${patch.notes ?? null}, notes),
      updated_at = now()
    where id = ${deadlineId} and fund_id = ${fundId}
  `
}

/**
 * Build the merged register: every catalog item with its computed
 * applicability (rule result unless overridden), settings, and this-year
 * deadline instance if one exists.
 */
export async function getComplianceOverview(fundId: string, year: number) {
  const [items, profile, settings, deadlines] = await Promise.all([
    getComplianceItems(),
    getFundProfile(fundId),
    getFundSettings(fundId),
    getDeadlines(fundId, year),
  ])
  const settingById = new Map(settings.map((s) => [s.compliance_item_id, s]))
  const deadlineById = new Map(deadlines.map((d) => [d.compliance_item_id, d]))

  const register = items.map((item) => {
    const s = settingById.get(item.id) ?? null
    const rule = evaluateApplicability(item.id, profile)
    const applicability: Applicability = s?.dismissed
      ? "not_applicable"
      : s?.applies === "yes" ? "applies"
      : s?.applies === "no" ? "not_applicable"
      : rule.result
    return {
      item,
      applicability,
      reason: s?.applies ? "Set manually" : rule.reason,
      dismissed: !!s?.dismissed,
      notes: s?.notes ?? null,
      deadline: deadlineById.get(item.id) ?? null,
    }
  })

  const applicable = register.filter((r) => r.applicability === "applies" && !r.dismissed)
  const filed = applicable.filter((r) => r.deadline?.status === "filed").length
  const overdue = applicable.filter((r) => {
    const d = r.deadline
    return d && d.status !== "filed" && d.status !== "not_applicable" && d.due_date && d.due_date < new Date().toISOString().slice(0, 10)
  }).length

  return {
    profile,
    register,
    summary: {
      total: items.length,
      applies: applicable.length,
      needsReview: register.filter((r) => r.applicability === "needs_review").length,
      filed,
      overdue,
    },
  }
}

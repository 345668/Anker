/**
 * Startup OpEx Pro-Forma — month-by-month operating expenses with a
 * hire roster + departmental + vendor roll-ups.  Pure functions; UI
 * and xlsx export both consume the same `compute()`.
 *
 * Inputs:
 *   - `hires`: each with role, dept, start month (0-based), monthly
 *     salary (USD), and an optional benefits/tax load multiplier
 *     (default 1.25× — covers benefits + employer payroll tax).
 *   - `vendors`: recurring vendor lines, each with category,
 *     monthly cost (USD), start month, end month (or open-ended).
 *   - `oneTime`: lump-sum spend (legal, equipment), at a specific month.
 *   - `revenuePerMonth` (optional): used to derive net burn.
 *   - `cashStart` (optional): lets the model show cash balance over time.
 *
 * Outputs:
 *   - 36-month table: total opex, by-department breakdown, headcount,
 *     monthly burn, cumulative burn, cash balance (if cashStart > 0).
 *   - Annual roll-ups (12 / 24 / 36 month opex totals).
 *   - Department mix at month 12.
 *   - Cash-runway months from month 0 (cashStart / avg(burn)).
 */

import { buildWorkbook, fmtUsd } from "./xlsx-export"

export interface OpexHire {
  id?: string
  role: string
  department: string
  monthlySalary: number          // USD
  startMonth: number             // 0..months-1
  /** Multiplier applied on top of base salary to model benefits + tax.
   *  Default 1.25 (US-typical fully-loaded rate). */
  loadMultiplier?: number
  /** Optional end month — model role rolling off. */
  endMonth?: number
}

export interface OpexVendor {
  id?: string
  name: string
  category: string               // "infra", "software", "marketing", "legal", "office", ...
  monthlyCost: number            // USD
  startMonth: number             // 0..months-1
  endMonth?: number              // open-ended if omitted
}

export interface OpexOneTime {
  id?: string
  description: string
  category: string
  amount: number                 // USD
  month: number
}

export interface OpexInputs {
  /** How many months to project — default 36. Capped at 60. */
  months?: number
  /** Starting cash balance (optional, for runway calc). */
  cashStart?: number
  /** Constant monthly revenue for net-burn calc. */
  revenuePerMonth?: number
  hires: OpexHire[]
  vendors: OpexVendor[]
  oneTime?: OpexOneTime[]
  /** Departments to render columns for, in order.  Defaults to the
   *  union of departments in `hires` + a final "Other" bucket. */
  departments?: string[]
  /** Vendor categories to surface as columns.  Defaults to the union. */
  vendorCategories?: string[]
}

export interface OpexMonthlyRow {
  month: number                  // 0-based index
  /** Per-department total (salaries × load multiplier). */
  perDept: Record<string, number>
  totalSalaries: number
  /** Per-vendor-category total. */
  perVendorCategory: Record<string, number>
  totalVendors: number
  oneTime: number
  totalOpex: number
  headcount: number
  revenue: number
  netBurn: number                // totalOpex - revenue
  cumulativeBurn: number
  cashBalance: number            // cashStart - cumulativeBurn (floored at 0 in display)
}

export interface OpexResult {
  months: number
  rows: OpexMonthlyRow[]
  departments: string[]
  vendorCategories: string[]
  /** Year-1 / Year-2 / Year-3 (whichever fit) total opex. */
  annualTotals: { year: number; opex: number; headcountAtYearEnd: number }[]
  /** Department mix at month 12 — useful for the chart. */
  deptMixMonth12: { dept: string; opex: number; pct: number }[]
  /** Months until cash runs out (cashStart / avg burn).  Infinity when
   *  net-burn is non-positive (revenue covers opex). */
  runwayMonths: number
  notes: string[]
}

const DEFAULT_LOAD = 1.25

export function compute(input: OpexInputs): OpexResult {
  const months = Math.min(60, Math.max(1, input.months ?? 36))
  const rows: OpexMonthlyRow[] = []
  const departments = uniqDepartments(input)
  const vendorCategories = uniqVendorCategories(input)
  const cashStart = input.cashStart ?? 0
  const revenuePerMonth = input.revenuePerMonth ?? 0
  const notes: string[] = []
  let cumulative = 0

  for (let m = 0; m < months; m++) {
    const perDept: Record<string, number> = Object.fromEntries(departments.map((d) => [d, 0]))
    let headcount = 0

    for (const h of input.hires) {
      const inWindow = m >= h.startMonth && (h.endMonth == null || m <= h.endMonth)
      if (!inWindow) continue
      const load = h.loadMultiplier ?? DEFAULT_LOAD
      const cost = (h.monthlySalary || 0) * load
      const dept = departments.includes(h.department) ? h.department : "Other"
      perDept[dept] = (perDept[dept] ?? 0) + cost
      headcount++
    }

    const perVendorCategory: Record<string, number> = Object.fromEntries(
      vendorCategories.map((c) => [c, 0]),
    )
    for (const v of input.vendors) {
      const inWindow = m >= v.startMonth && (v.endMonth == null || m <= v.endMonth)
      if (!inWindow) continue
      const cat = vendorCategories.includes(v.category) ? v.category : "Other"
      perVendorCategory[cat] = (perVendorCategory[cat] ?? 0) + (v.monthlyCost || 0)
    }

    const oneTime = (input.oneTime ?? [])
      .filter((o) => o.month === m)
      .reduce((sum, o) => sum + (o.amount || 0), 0)

    const totalSalaries = sum(Object.values(perDept))
    const totalVendors = sum(Object.values(perVendorCategory))
    const totalOpex = totalSalaries + totalVendors + oneTime
    const netBurn = totalOpex - revenuePerMonth
    cumulative += netBurn
    const cashBalance = cashStart - cumulative

    rows.push({
      month: m,
      perDept, totalSalaries,
      perVendorCategory, totalVendors,
      oneTime, totalOpex,
      headcount, revenue: revenuePerMonth, netBurn,
      cumulativeBurn: cumulative, cashBalance,
    })
  }

  // Annual roll-ups
  const annualTotals: OpexResult["annualTotals"] = []
  for (let y = 1; y <= 3; y++) {
    const start = (y - 1) * 12
    const end = Math.min(months, y * 12)
    if (start >= months) break
    const opex = rows.slice(start, end).reduce((s, r) => s + r.totalOpex, 0)
    const headcountAtYearEnd = rows[end - 1].headcount
    annualTotals.push({ year: y, opex, headcountAtYearEnd })
  }

  const month12 = rows[Math.min(11, months - 1)]
  const totalAt12 = month12.totalOpex || 1
  const deptMixMonth12 = departments
    .map((d) => ({ dept: d, opex: month12.perDept[d] ?? 0, pct: (month12.perDept[d] ?? 0) / totalAt12 }))
    .sort((a, b) => b.opex - a.opex)

  // Runway: cashStart / average net burn over first 12 months (or
  // until burn turns positive — i.e. when revenue covers opex).
  let runwayMonths: number
  const window = rows.slice(0, Math.min(12, rows.length))
  const avgBurn = window.reduce((s, r) => s + r.netBurn, 0) / window.length
  if (cashStart <= 0) runwayMonths = 0
  else if (avgBurn <= 0) runwayMonths = Infinity
  else runwayMonths = cashStart / avgBurn

  if (cashStart > 0 && runwayMonths !== Infinity && runwayMonths < 9)
    notes.push("Runway under 9 months — typical fundraise window is 6 months, so plan for an immediate raise or a burn cut.")
  if (cashStart > 0 && runwayMonths !== Infinity && runwayMonths >= 9 && runwayMonths < 18)
    notes.push("Runway 9-18 months — start the next fundraise process within 3-6 months.")
  const totalSalariesY1 = rows.slice(0, Math.min(12, months)).reduce((s, r) => s + r.totalSalaries, 0)
  const totalOpexY1 = annualTotals[0]?.opex ?? 0
  if (totalOpexY1 > 0 && totalSalariesY1 / totalOpexY1 < 0.55)
    notes.push("Salaries under 55% of opex is unusually low for an early-stage company — double-check the hire roster.")
  if (rows[months - 1].headcount === rows[0].headcount)
    notes.push("Headcount is flat for the entire projection. Add planned hires to the roster to stress-test the model.")

  return {
    months, rows, departments, vendorCategories,
    annualTotals, deptMixMonth12,
    runwayMonths, notes,
  }
}

// ─── helpers ───────────────────────────────────────────────────────────
function uniqDepartments(i: OpexInputs): string[] {
  if (i.departments?.length) return i.departments
  const set = new Set<string>()
  for (const h of i.hires) if (h.department) set.add(h.department)
  if (set.size === 0) set.add("Engineering")
  set.add("Other")
  return Array.from(set)
}
function uniqVendorCategories(i: OpexInputs): string[] {
  if (i.vendorCategories?.length) return i.vendorCategories
  const set = new Set<string>()
  for (const v of i.vendors) if (v.category) set.add(v.category)
  if (set.size === 0) set.add("Software")
  set.add("Other")
  return Array.from(set)
}
function sum(arr: number[]): number { return arr.reduce((a, b) => a + b, 0) }

// ─── xlsx export ───────────────────────────────────────────────────────
export function buildExportWorkbook(state: OpexInputs) {
  const r = compute(state)

  // Sheet 1: monthly P&L roll-up
  const monthlyHeaders = [
    "Month", "Headcount",
    ...r.departments.map((d) => `Salary · ${d}`),
    "Total salaries",
    ...r.vendorCategories.map((c) => `Vendor · ${c}`),
    "Total vendors",
    "One-time", "Total opex",
    "Revenue", "Net burn", "Cumulative burn", "Cash balance",
  ]
  const monthlyRows = r.rows.map((row) => [
    monthLabel(row.month),
    row.headcount,
    ...r.departments.map((d) => Math.round(row.perDept[d] ?? 0)),
    Math.round(row.totalSalaries),
    ...r.vendorCategories.map((c) => Math.round(row.perVendorCategory[c] ?? 0)),
    Math.round(row.totalVendors),
    Math.round(row.oneTime),
    Math.round(row.totalOpex),
    Math.round(row.revenue),
    Math.round(row.netBurn),
    Math.round(row.cumulativeBurn),
    Math.round(row.cashBalance),
  ])

  // Sheet 2: annual roll-ups
  const annualHeaders = ["Year", "Total opex", "Headcount at year end"]
  const annualRows = r.annualTotals.map((y) => [
    `Year ${y.year}`,
    fmtUsd(y.opex),
    y.headcountAtYearEnd,
  ])

  // Sheet 3: hire roster (echoes input for traceability)
  const hireHeaders = ["Role", "Department", "Start month", "End month", "Monthly salary", "Load × ", "Fully loaded monthly"]
  const hireRows = state.hires.map((h) => [
    h.role,
    h.department,
    monthLabel(h.startMonth),
    h.endMonth != null ? monthLabel(h.endMonth) : "open",
    fmtUsd(h.monthlySalary),
    (h.loadMultiplier ?? DEFAULT_LOAD).toFixed(2),
    fmtUsd(h.monthlySalary * (h.loadMultiplier ?? DEFAULT_LOAD)),
  ])

  // Sheet 4: vendor lines
  const vendorHeaders = ["Vendor", "Category", "Start month", "End month", "Monthly cost"]
  const vendorRows = state.vendors.map((v) => [
    v.name, v.category,
    monthLabel(v.startMonth),
    v.endMonth != null ? monthLabel(v.endMonth) : "open",
    fmtUsd(v.monthlyCost),
  ])

  return buildWorkbook([
    {
      name: "Monthly P&L",
      title: "Anker — OpEx Pro-Forma",
      subtitle: `${r.months} months · ${state.hires.length} roles · ${state.vendors.length} vendor lines`,
      headers: monthlyHeaders,
      rows: monthlyRows,
      colWidths: [10, 10, ...r.departments.map(() => 14), 14,
                  ...r.vendorCategories.map(() => 14), 14, 12, 14, 12, 14, 16, 14],
      freeze: true,
    },
    { name: "Annual roll-up", headers: annualHeaders, rows: annualRows, colWidths: [10, 16, 22] },
    { name: "Hire roster", headers: hireHeaders, rows: hireRows, colWidths: [24, 16, 12, 12, 14, 8, 18] },
    { name: "Vendors", headers: vendorHeaders, rows: vendorRows, colWidths: [24, 16, 12, 12, 14] },
  ])
}

function monthLabel(idx: number): string {
  const y = Math.floor(idx / 12) + 1
  const m = (idx % 12) + 1
  return `Y${y} · M${String(m).padStart(2, "0")}`
}

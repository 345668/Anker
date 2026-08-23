/**
 * Companies House (UK registrar) read client.
 *
 * Pulls a company's profile + filing history from the free public API and derives the
 * upcoming statutory filings (confirmation statement, annual accounts) with their due
 * dates, so they can be synced into the equity-compliance register.
 *
 * Inert until configured: with no COMPANIES_HOUSE_API_KEY the client reports "not
 * configured" and the caller degrades gracefully. Never throws — returns typed results.
 *
 * Auth: HTTP Basic with the API key as the username and an empty password
 * (https://developer.company-information.service.gov.uk/). Read-only.
 */

const BASE = "https://api.company-information.service.gov.uk"
const TIMEOUT_MS = 15_000

export function isCompaniesHouseConfigured(): boolean {
  return !!process.env.COMPANIES_HOUSE_API_KEY
}

export interface CompanyProfile {
  companyNumber: string
  companyName: string
  status: string | null
  type: string | null
  incorporatedOn: string | null
  confirmationStatementNextDue: string | null
  confirmationStatementOverdue: boolean
  accountsNextDue: string | null
  accountsOverdue: boolean
}

export interface UpcomingFiling {
  title: string
  filingType: string
  dueDate: string
  overdue: boolean
}

export interface FilingHistoryItem {
  date: string | null
  category: string | null
  description: string | null
  type: string | null
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string; status?: number }

function authHeader(): string | null {
  const key = process.env.COMPANIES_HOUSE_API_KEY
  if (!key) return null
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`
}

/** Normalize a UK company number: uppercase, strip spaces. CH numbers are 8 chars. */
export function normalizeCompanyNumber(input: string): string {
  return String(input ?? "").toUpperCase().replace(/\s+/g, "").trim()
}

async function chGet<T>(path: string, map: (json: any) => T): Promise<Result<T>> {
  const auth = authHeader()
  if (!auth) return { ok: false, error: "Companies House is not configured — set COMPANIES_HOUSE_API_KEY." }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { authorization: auth, accept: "application/json" }, signal: controller.signal })
    if (res.status === 401) return { ok: false, error: "Companies House rejected the API key (401).", status: 401 }
    if (res.status === 404) return { ok: false, error: "No company found for that number.", status: 404 }
    if (res.status === 429) return { ok: false, error: "Companies House rate limit reached — try again shortly.", status: 429 }
    if (!res.ok) return { ok: false, error: `Companies House returned ${res.status}.`, status: res.status }
    const json = await res.json().catch(() => null)
    if (!json) return { ok: false, error: "Companies House returned an unreadable response." }
    return { ok: true, data: map(json) }
  } catch (e: any) {
    const reason = e?.name === "AbortError" ? `timed out after ${TIMEOUT_MS}ms` : (e?.message ?? "network error")
    return { ok: false, error: `Companies House request failed: ${reason}` }
  } finally {
    clearTimeout(timer)
  }
}

export function getCompanyProfile(companyNumber: string): Promise<Result<CompanyProfile>> {
  const num = normalizeCompanyNumber(companyNumber)
  if (!num) return Promise.resolve({ ok: false as const, error: "Provide a company number." })
  return chGet(`/company/${encodeURIComponent(num)}`, (j) => ({
    companyNumber: String(j.company_number ?? num),
    companyName: String(j.company_name ?? ""),
    status: j.company_status ?? null,
    type: j.type ?? null,
    incorporatedOn: j.date_of_creation ?? null,
    confirmationStatementNextDue: j.confirmation_statement?.next_due ?? null,
    confirmationStatementOverdue: !!j.confirmation_statement?.overdue,
    accountsNextDue: j.accounts?.next_due ?? null,
    accountsOverdue: !!j.accounts?.overdue,
  }))
}

export function getFilingHistory(companyNumber: string): Promise<Result<FilingHistoryItem[]>> {
  const num = normalizeCompanyNumber(companyNumber)
  return chGet(`/company/${encodeURIComponent(num)}/filing-history?items_per_page=35`, (j) =>
    (Array.isArray(j.items) ? j.items : []).map((it: any) => ({
      date: it.date ?? null, category: it.category ?? null, description: it.description ?? null, type: it.type ?? null,
    })),
  )
}

/** Upcoming statutory filings derived from the profile: confirmation statement + accounts. */
export function deriveUpcomingFilings(p: CompanyProfile): UpcomingFiling[] {
  const out: UpcomingFiling[] = []
  if (p.confirmationStatementNextDue) {
    out.push({ title: "Confirmation statement (CS01)", filingType: "Companies House · CS01", dueDate: p.confirmationStatementNextDue, overdue: p.confirmationStatementOverdue })
  }
  if (p.accountsNextDue) {
    out.push({ title: "Annual accounts", filingType: "Companies House · AA", dueDate: p.accountsNextDue, overdue: p.accountsOverdue })
  }
  return out
}

/**
 * Compliance digest — the data behind the weekly nudge email and the
 * Compliance nav badge.
 *
 * "Entering their window" means a deadline that is either already overdue
 * (past due, not filed) or coming due within the lead window (default 30
 * days). Filed and not-applicable instances are excluded — you only get
 * nudged about things that still need action.
 *
 * Both the cron (app/api/cron/compliance-digest) and the badge count endpoint
 * read through here so they can never disagree.
 */
import { sql } from "@/lib/db"

/** Statuses that still need action — everything except filed / not_applicable. */
const OPEN_STATUSES = ["upcoming", "in_progress", "extended", "overdue"] as const

export const DEFAULT_LEAD_DAYS = 30

export interface DigestDeadline {
  deadlineId: string
  itemName: string
  shortName: string
  category: string
  dueDate: string | null
  status: string
  filingPortalUrl: string | null
  /** Whole days until due (negative = overdue). null when no due_date. */
  daysUntilDue: number | null
  overdue: boolean
}

export interface FundDigest {
  fundId: string
  fundSlug: string
  fundName: string
  /** Per-fund recipient override from funds.metadata->>'admin_email'. */
  adminEmailOverride: string | null
  overdue: DigestDeadline[]
  upcoming: DigestDeadline[]
  /** overdue.length + upcoming.length — the badge count for this fund. */
  total: number
}

interface Row {
  fund_id: string
  fund_slug: string
  fund_name: string
  admin_email: string | null
  deadline_id: string
  item_name: string
  short_name: string
  category: string
  due_date: string | null
  status: string
  filing_portal_url: string | null
}

/**
 * Compute the compliance digest for every fund that has open deadlines inside
 * the window. Funds with nothing to nudge about are omitted entirely.
 *
 * @param leadDays how far ahead counts as "entering the window" (default 30)
 * @param today    ISO yyyy-mm-dd override, for tests/determinism
 */
export async function computeComplianceDigests(
  leadDays: number = DEFAULT_LEAD_DAYS,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<FundDigest[]> {
  const horizon = new Date(`${today}T00:00:00Z`)
  horizon.setUTCDate(horizon.getUTCDate() + Math.max(0, leadDays))
  const horizonStr = horizon.toISOString().slice(0, 10)

  // Open deadlines that are either overdue (due < today) or due on/before the
  // horizon. Deadlines with no due_date are skipped — they can't "enter a
  // window". Join items for display + the filing portal link.
  const rows = (await sql`
    SELECT
      f.id             AS fund_id,
      f.slug           AS fund_slug,
      f.name           AS fund_name,
      f.metadata->>'admin_email' AS admin_email,
      d.id             AS deadline_id,
      i.name           AS item_name,
      i.short_name     AS short_name,
      i.category       AS category,
      d.due_date::text AS due_date,
      d.status         AS status,
      i.filing_portal_url AS filing_portal_url
    FROM compliance_deadlines d
    JOIN funds f            ON f.id = d.fund_id
    JOIN compliance_items i ON i.id = d.compliance_item_id
    WHERE d.status = ANY(${OPEN_STATUSES as unknown as string[]})
      AND d.due_date IS NOT NULL
      AND d.due_date <= ${horizonStr}::date
    ORDER BY f.name ASC, d.due_date ASC
  `) as Row[]

  const byFund = new Map<string, FundDigest>()
  for (const r of rows) {
    let fund = byFund.get(r.fund_id)
    if (!fund) {
      fund = {
        fundId: r.fund_id,
        fundSlug: r.fund_slug,
        fundName: r.fund_name,
        adminEmailOverride: r.admin_email,
        overdue: [],
        upcoming: [],
        total: 0,
      }
      byFund.set(r.fund_id, fund)
    }
    const days = r.due_date ? daysBetween(today, r.due_date) : null
    const overdue = days !== null && days < 0
    const entry: DigestDeadline = {
      deadlineId: r.deadline_id,
      itemName: r.item_name,
      shortName: r.short_name,
      category: r.category,
      dueDate: r.due_date,
      status: r.status,
      filingPortalUrl: r.filing_portal_url,
      daysUntilDue: days,
      overdue,
    }
    ;(overdue ? fund.overdue : fund.upcoming).push(entry)
    fund.total++
  }

  return [...byFund.values()]
}

/** Whole days from `from` to `to` (both ISO yyyy-mm-dd). Positive = future. */
function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

/**
 * Render a fund's digest as a plain-text email body. Transactional tone, no
 * marketing. Overdue items lead; upcoming follow, sorted soonest-first.
 */
export function renderDigestText(fund: FundDigest, appUrl: string): string {
  const lines: string[] = []
  lines.push(`Compliance digest — ${fund.fundName}`)
  lines.push("")

  if (fund.overdue.length) {
    lines.push(`⚠ OVERDUE (${fund.overdue.length})`)
    for (const d of fund.overdue) lines.push(`  • ${fmt(d)}`)
    lines.push("")
  }

  if (fund.upcoming.length) {
    lines.push(`Due soon (${fund.upcoming.length})`)
    for (const d of fund.upcoming) lines.push(`  • ${fmt(d)}`)
    lines.push("")
  }

  const link = appUrl ? `${appUrl.replace(/\/$/, "")}/dashboard/portfolio/fund/compliance` : null
  if (link) {
    lines.push(`Review and update filing status:`)
    lines.push(link)
    lines.push("")
  }
  lines.push(`You're receiving this because you're listed as an admin for ${fund.fundName}.`)
  return lines.join("\n")
}

function fmt(d: DigestDeadline): string {
  const when =
    d.daysUntilDue === null ? "no date"
    : d.daysUntilDue < 0 ? `${Math.abs(d.daysUntilDue)}d overdue`
    : d.daysUntilDue === 0 ? "due today"
    : `in ${d.daysUntilDue}d`
  return `${d.itemName} — due ${d.dueDate ?? "?"} (${when})`
}

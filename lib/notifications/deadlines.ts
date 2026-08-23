/**
 * Deadline scanner — turns approaching/overdue fund deadlines into in-app
 * notifications for the fund's GP users. Deterministic + idempotent: each item
 * yields at most two reminders (a "due soon" and an "overdue"), keyed so a daily
 * re-run never duplicates them.
 *
 * Sources (fund-scoped — clean recipient mapping via organizations.fund_id →
 * memberships):
 *   • capital_calls   status='sent',   due_date within lead window or overdue
 *   • distributions   status='notified', payment_date within lead window or overdue
 *
 * Recipients: members of the fund's org with org_role workspace_owner|admin.
 *
 * Extension seam (not yet wired): company-scoped deadlines — 409A expiry
 * (valuations_409a.expires_at) and equity_filings — need the company→user
 * mapping resolved first (company_id → founder org/owner), so they're
 * intentionally left out of this MVP rather than notifying the wrong person.
 */
import "server-only"
import { sql } from "@/lib/db"
import { createNotification, type NotificationSeverity } from "./store"

const DEFAULT_LEAD_DAYS = 14

export interface DeadlineScanResult {
  scanned: number
  created: number
  byKind: Record<string, number>
  /** In dryRun, the reminders that WOULD be created. */
  preview?: { userId: string; kind: string; title: string; dedupeKey: string }[]
}

interface PlannedReminder {
  userId: string
  orgId: string | null
  kind: string
  severity: NotificationSeverity
  title: string
  body: string
  href: string
  dedupeKey: string
}

const daysUntil = (dateStr: string): number => {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`).getTime()
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime()
  return Math.round((d - today) / 86_400_000)
}
const money = (n: number) => (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })

/** GP users (owner/admin) for a fund, via its org. */
async function fundRecipients(fundId: string): Promise<{ userId: string; orgId: string }[]> {
  try {
    return await sql`
      SELECT DISTINCT m.user_id, m.org_id
      FROM memberships m JOIN organizations o ON o.id = m.org_id
      WHERE o.fund_id = ${fundId} AND m.org_role IN ('workspace_owner','admin')` as { userId: string; orgId: string }[]
  } catch {
    return []
  }
}

/** Tier a dated deadline into a reminder (or null if outside the window). */
function tier(days: number, leadDays: number): { bucket: "overdue" | "soon"; severity: NotificationSeverity; phrase: string } | null {
  if (days < 0) return { bucket: "overdue", severity: "urgent", phrase: `overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}` }
  if (days <= leadDays) return { bucket: "soon", severity: days <= 3 ? "warning" : "info", phrase: days === 0 ? "due today" : `due in ${days} day${days === 1 ? "" : "s"}` }
  return null
}

export async function scanDeadlines(opts: { leadDays?: number; dryRun?: boolean } = {}): Promise<DeadlineScanResult> {
  const leadDays = Math.max(1, Math.min(90, opts.leadDays ?? DEFAULT_LEAD_DAYS))
  const planned: PlannedReminder[] = []

  // ── Capital calls ────────────────────────────────────────────────────────
  let calls: any[] = []
  try {
    calls = await sql`SELECT id, fund_id, name, total_amount, due_date FROM capital_calls
                      WHERE status = 'sent' AND due_date IS NOT NULL` as any[]
  } catch { calls = [] }
  for (const c of calls) {
    const t = tier(daysUntil(String(c.due_date)), leadDays)
    if (!t) continue
    const recips = await fundRecipients(String(c.fund_id))
    for (const r of recips) {
      planned.push({
        userId: r.userId, orgId: r.orgId, kind: "capital_call_due", severity: t.severity,
        title: `Capital call ${t.phrase}`,
        body: `${c.name ?? "Capital call"} — ${money(c.total_amount)} — ${t.phrase} (${String(c.due_date).slice(0, 10)}).`,
        href: `/dashboard/portfolio/fund/calls/${c.id}`,
        dedupeKey: `capital_call_due:${c.id}:${t.bucket}`,
      })
    }
  }

  // ── Distributions ────────────────────────────────────────────────────────
  let dists: any[] = []
  try {
    dists = await sql`SELECT id, fund_id, distribution_number, net_amount, payment_date FROM distributions
                      WHERE status = 'notified' AND payment_date IS NOT NULL` as any[]
  } catch { dists = [] }
  for (const d of dists) {
    const t = tier(daysUntil(String(d.payment_date)), leadDays)
    if (!t) continue
    const recips = await fundRecipients(String(d.fund_id))
    for (const r of recips) {
      planned.push({
        userId: r.userId, orgId: r.orgId, kind: "distribution_due", severity: t.severity,
        title: `Distribution payment ${t.phrase}`,
        body: `Distribution #${d.distribution_number ?? "?"} — ${money(d.net_amount)} — payment ${t.phrase} (${String(d.payment_date).slice(0, 10)}).`,
        href: `/dashboard/portfolio/fund/distributions/${d.id}`,
        dedupeKey: `distribution_due:${d.id}:${t.bucket}`,
      })
    }
  }

  const byKind: Record<string, number> = {}
  const bump = (k: string) => { byKind[k] = (byKind[k] ?? 0) + 1 }

  if (opts.dryRun) {
    for (const p of planned) bump(p.kind)
    return { scanned: planned.length, created: 0, byKind, preview: planned.map((p) => ({ userId: p.userId, kind: p.kind, title: p.title, dedupeKey: p.dedupeKey })) }
  }

  let created = 0
  for (const p of planned) {
    try {
      const { created: didCreate } = await createNotification({
        userId: p.userId, orgId: p.orgId, kind: p.kind, severity: p.severity,
        title: p.title, body: p.body, href: p.href, dedupeKey: p.dedupeKey,
      })
      if (didCreate) { created++; bump(p.kind) }
    } catch {
      // one bad row must not abort the whole scan
    }
  }
  return { scanned: planned.length, created, byKind }
}

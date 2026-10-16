import "server-only"
import { sql } from "@/lib/db"
import { createNotification } from "@/lib/notifications/store"
import { allowanceOf } from "./allowance"

/**
 * Tells a workspace's owners and admins when the month's AI allowance is 80% and 100% used, once each per month (docs/architecture/58 section 5).
 * Each threshold is recorded first, so a second run, or two runs at once, cannot send it twice. The message states amounts and names no content.
 */
export const THRESHOLDS = [80, 100] as const

export async function sweepAllowanceWarnings(now = new Date()): Promise<{ checked: number; warned: number }> {
  const orgs = (await sql`SELECT org_id FROM (
      SELECT workspace_id AS org_id FROM ai_calls WHERE workspace_id IS NOT NULL AND created_at >= date_trunc('month', now()) AND cost_usd > 0
      UNION SELECT org_id FROM usage_events WHERE org_id IS NOT NULL AND created_at >= date_trunc('month', now())) x LIMIT 500`) as any[]
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
  let warned = 0
  for (const o of orgs) {
    const orgId = String(o.org_id)
    let a; try { a = await allowanceOf(orgId) } catch { continue }
    if (a.limit === null || a.limit <= 0 || a.pct === null) continue
    for (const t of THRESHOLDS) {
      if (a.pct * 100 < t) continue
      const fresh = (await sql`INSERT INTO usage_warnings (org_id, month, threshold, used_usd, limit_usd) VALUES (${orgId}, ${month}::date, ${t}, ${a.used}, ${a.limit}) ON CONFLICT DO NOTHING RETURNING threshold`) as any[]
      if (!fresh.length) continue
      warned++
      const owners = (await sql`SELECT user_id FROM memberships WHERE org_id::text = ${orgId} AND org_role IN ('workspace_owner', 'admin')`) as any[]
      for (const m of owners) {
        await createNotification({
          userId: String(m.user_id), orgId, kind: "usage_limit", severity: t >= 100 ? "urgent" : "warning",
          title: t >= 100 ? "This month's AI allowance is used up" : "80% of this month's AI allowance is used",
          body: t >= 100 ? "AI answers, voice notes, document reading and generation are paused until it resets next month. Ask support to raise it if you need more now." : `You have used $${a.used.toFixed(2)} of $${a.limit.toFixed(2)}. See where it went on the Usage page.`,
          href: "/dashboard/usage", dedupeKey: `usage:${month}:${t}`,
        }).catch(() => {})
      }
    }
  }
  return { checked: orgs.length, warned }
}

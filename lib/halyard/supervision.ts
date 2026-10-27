import "server-only"
import { sql } from "@/lib/db"

/**
 * What the platform sees of Halyard (docs/architecture/62 section 15): counts, timings and health, per workspace. By construction there is no call content in this module: no transcript,
 * no title, no note, no suggestion text, no participant. A test fails if one of those columns is ever selected here.
 */
export interface HalyardOverview {
  flagOn: boolean
  health: { windowMin: number; suggestions: number; p50Ms: number | null; p95Ms: number | null; uploads: number; failed: number; failureRate: number | null }
  totals: { sessions30d: number; liveNow: number; minutes30d: number; suggestions30d: number }
  workspaces: Array<{ orgId: string; orgName: string | null; sessions30d: number; minutes30d: number; suggestions30d: number; liveNow: number; featureOverride: boolean | null; retentionMonths: number }>
}
export async function halyardOverview(): Promise<HalyardOverview> {
  const [flag] = (await sql`SELECT enabled FROM platform_flags WHERE key = 'halyard_web'`) as any[]
  const [h] = (await sql`SELECT count(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms) AS p50, percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms) AS p95 FROM halyard_suggestions WHERE requested_at > now() - interval '15 minutes' AND total_ms IS NOT NULL`) as any[]
  const [u] = (await sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE NOT ok)::int AS failed FROM halyard_uploads WHERE created_at > now() - interval '15 minutes'`) as any[]
  const rows = (await sql`SELECT s.org_id, o.name AS org_name, count(*)::int AS sessions, COALESCE(sum(s.audio_seconds), 0)::int AS secs, count(*) FILTER (WHERE s.state IN ('live','paused'))::int AS live
    FROM halyard_sessions s LEFT JOIN organizations o ON o.id::text = s.org_id WHERE s.started_at > now() - interval '30 days' GROUP BY s.org_id, o.name ORDER BY secs DESC LIMIT 200`) as any[]
  const sug = new Map(((await sql`SELECT s.org_id, count(*)::int AS n FROM halyard_suggestions g JOIN halyard_sessions s ON s.id = g.session_id WHERE g.requested_at > now() - interval '30 days' GROUP BY s.org_id`) as any[]).map((r) => [String(r.org_id), Number(r.n)]))
  const ov = new Map(((await sql`SELECT org_id, features FROM tenant_entitlements WHERE features ? 'halyard'`.catch(() => [])) as any[]).map((r) => [String(r.org_id), r.features?.halyard === true]))
  const ret = new Map(((await sql`SELECT org_id, retention_months FROM halyard_settings`) as any[]).map((r) => [String(r.org_id), Number(r.retention_months ?? 12)]))
  const workspaces = rows.map((r) => ({ orgId: String(r.org_id), orgName: r.org_name ?? null, sessions30d: r.sessions, minutes30d: Math.round(r.secs / 60), suggestions30d: sug.get(String(r.org_id)) ?? 0, liveNow: r.live, featureOverride: ov.has(String(r.org_id)) ? ov.get(String(r.org_id))! : null, retentionMonths: ret.get(String(r.org_id)) ?? 12 }))
  const n = Number(u?.n ?? 0), f = Number(u?.failed ?? 0)
  return {
    flagOn: !!flag?.enabled,
    health: { windowMin: 15, suggestions: Number(h?.n ?? 0), p50Ms: h?.p50 == null ? null : Math.round(Number(h.p50)), p95Ms: h?.p95 == null ? null : Math.round(Number(h.p95)), uploads: n, failed: f, failureRate: n ? f / n : null },
    totals: { sessions30d: workspaces.reduce((a, w) => a + w.sessions30d, 0), liveNow: workspaces.reduce((a, w) => a + w.liveNow, 0), minutes30d: workspaces.reduce((a, w) => a + w.minutes30d, 0), suggestions30d: workspaces.reduce((a, w) => a + w.suggestions30d, 0) },
    workspaces,
  }
}

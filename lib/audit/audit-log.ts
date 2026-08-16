import { sql } from "@/lib/db"

/**
 * Immutable audit trail. `logAudit` is best-effort and never throws — an audit
 * write must not break the action it records — so callers can fire-and-forget.
 * The feed at /dashboard/admin/audit reads via listAuditEvents.
 */

export interface AuditEvent {
  id: string
  actor_id: string | null
  actor_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  target_label: string | null
  metadata: Record<string, unknown>
  ip: string | null
  user_agent: string | null
  created_at: string
}

export interface AuditInput {
  actorId?: string | null
  actorEmail?: string | null
  action: string
  targetType?: string | null
  targetId?: string | null
  targetLabel?: string | null
  metadata?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}

export async function logAudit(e: AuditInput): Promise<void> {
  try {
    await sql`
      INSERT INTO audit_events (actor_id, actor_email, action, target_type, target_id, target_label, metadata, ip, user_agent)
      VALUES (
        ${e.actorId ?? null}, ${e.actorEmail ?? null}, ${e.action},
        ${e.targetType ?? null}, ${e.targetId ?? null}, ${e.targetLabel ?? null},
        ${JSON.stringify(e.metadata ?? {})}::jsonb, ${e.ip ?? null}, ${e.userAgent ?? null}
      )`
  } catch (err) {
    // Never let auditing break the underlying action.
    console.error("[audit] write failed:", (err as Error)?.message)
  }
}

function norm(r: any): AuditEvent {
  return {
    id: r.id, actor_id: r.actor_id ?? null, actor_email: r.actor_email ?? null,
    action: r.action, target_type: r.target_type ?? null, target_id: r.target_id ?? null,
    target_label: r.target_label ?? null,
    metadata: typeof r.metadata === "string" ? safeParse(r.metadata) : (r.metadata ?? {}),
    ip: r.ip ?? null, user_agent: r.user_agent ?? null, created_at: String(r.created_at),
  }
}
function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) } catch { return {} }
}

export interface AuditQuery {
  actor?: string
  action?: string
  targetType?: string
  limit?: number
  before?: string | null
}

/** Paginated, filterable feed (newest first). `before` is a created_at cursor. */
export async function listAuditEvents(q: AuditQuery = {}): Promise<{ events: AuditEvent[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200)
  const actor = q.actor?.trim() ? `%${q.actor.trim().toLowerCase()}%` : null
  const action = q.action?.trim() || null
  const targetType = q.targetType?.trim() || null
  const before = q.before || null

  const rows = await sql`
    SELECT * FROM audit_events
    WHERE (${actor}::text IS NULL OR LOWER(COALESCE(actor_email, '')) LIKE ${actor})
      AND (${action}::text IS NULL OR action = ${action})
      AND (${targetType}::text IS NULL OR target_type = ${targetType})
      AND (${before}::timestamptz IS NULL OR created_at < ${before}::timestamptz)
    ORDER BY created_at DESC
    LIMIT ${limit + 1}`

  const events = rows.slice(0, limit).map(norm)
  const nextCursor = rows.length > limit ? events[events.length - 1]?.created_at ?? null : null
  return { events, nextCursor }
}

/** Distinct action names present, for the filter dropdown. */
export async function listAuditActions(): Promise<string[]> {
  const rows = await sql`SELECT DISTINCT action FROM audit_events ORDER BY action ASC LIMIT 100`
  return rows.map((r: any) => r.action as string)
}

export async function getAuditStats(): Promise<{ total: number; last24h: number; actors: number }> {
  const rows = await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS last24h,
      count(DISTINCT actor_email)::int AS actors
    FROM audit_events`
  return { total: rows[0]?.total ?? 0, last24h: rows[0]?.last24h ?? 0, actors: rows[0]?.actors ?? 0 }
}

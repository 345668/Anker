import { sql } from "@/lib/db"

/**
 * Record a change to a record that matters — what it was, what it became, who
 * did it, and whose data it was.
 *
 * The platform recorded what things ARE and almost never what they WERE: six
 * logAudit() call sites served three personas whose day-to-day work is
 * producing records — a cap table, a capital account, an AML decision. This is
 * the single mechanism every such write now goes through.
 * See docs/architecture/08-audit-logging-implementation.md.
 *
 * Guarantees:
 *
 *   • It never throws. An audit write that breaks a capital call is worse than a
 *     missing audit row.
 *   • It is not silent. Unlike logAudit(), a failed write is logged loudly: a
 *     quietly missing row in a table that exists to be complete is exactly the
 *     failure this replaces.
 *   • It stores full before/after snapshots, so a deleted record is recoverable
 *     from the `before` of its delete event without a history table per entity.
 *   • A change that changes nothing is not recorded. A trail full of no-op saves
 *     hides the real changes inside it.
 */

export interface Actor {
  userId: string | null
  email?: string | null
}

/** The tenant boundary the writing module already uses. Mirrors the persona
 *  scope key (docs/architecture/00) so these map onto it rather than being
 *  re-keyed later.
 *
 *  `user` exists because some records have no tenant yet: spvs, loans and
 *  contracts carry only created_by. Recording them as `user:<id>` states that
 *  plainly rather than inventing a company they do not belong to — and it is
 *  the same isolation gap doc 00 describes for outreach, visible in the trail. */
export interface Scope {
  type: "company" | "fund" | "org" | "user"
  id: string
}

export interface ChangeInput {
  actor: Actor
  scope: Scope
  /** `<entity>.<verb>` — e.g. option_grant.created, capital_call.sent. */
  action: string
  target: { type: string; id: string; label?: string | null }
  /** Null on create. */
  before?: Record<string, unknown> | null
  /** Null on delete. */
  after?: Record<string, unknown> | null
  /** Anything that is not a field of the row — a reason, a request context. */
  context?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}

/**
 * Who is making a change, carried from the route into the module that makes it.
 *
 * Optional at every call site, and recorded even when absent: a caller that
 * forgets to pass it still leaves a trail, with a visible null actor, rather
 * than no trail at all. The failure mode should be an incomplete record, never
 * a missing one.
 */
export interface AuditContext {
  actor: Actor
  ip?: string | null
  userAgent?: string | null
}

/** Build an AuditContext from a request and the resolved user. */
export function auditContext(
  req: { headers: { get(name: string): string | null } },
  user: { userId?: string | null; id?: string | null; email?: string | null },
): AuditContext {
  return {
    actor: { userId: user.userId ?? user.id ?? null, email: user.email ?? null },
    // First hop only: x-forwarded-for can carry a chain of proxies.
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
  }
}

/** Spread into recordChange when a module was given a context (or was not). */
export function actorFields(ctx: AuditContext | undefined) {
  return { actor: ctx?.actor ?? { userId: null }, ip: ctx?.ip ?? null, userAgent: ctx?.userAgent ?? null }
}

export function scopeKey(scope: Scope): string {
  return `${scope.type}:${scope.id}`
}

/** Bookkeeping the database maintains. Excluded from the diff so that saving an
 *  unchanged record produces an empty diff and is not recorded. */
const NOISE = new Set(["updated_at", "created_at"])

/** Never stored, even inside a snapshot. Matched on the column name. */
const SECRET = /(token|secret|password|api_?key|private_?key)/i

export function redact(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[k] = SECRET.test(k) ? "[redacted]" : normalise(v)
  return out
}

/** Dates and numeric strings compared as values, not as object identities or
 *  as "10000" vs 10000 — the drivers return numerics as strings. */
function normalise(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString()
  return v
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return a == b
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a), nb = Number(b)
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb
  }
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Field-level diff: { field: [before, after] } for every field that changed. */
export function diff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {}
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  for (const k of keys) {
    if (NOISE.has(k)) continue
    const b = before?.[k] ?? null
    const a = after?.[k] ?? null
    if (!same(b, a)) out[k] = [b, a]
  }
  return out
}

export async function recordChange(input: ChangeInput): Promise<void> {
  const before = redact(input.before)
  const after = redact(input.after)
  const changes = diff(before, after)

  // An update that changed nothing is not an event. Creates and deletes always
  // are — one side is null, so the diff is never empty for them.
  if (before && after && Object.keys(changes).length === 0) return

  // Retried, because "never throws" alone means a single network blip loses a
  // record permanently. Found by a live verification run in which one event of
  // six went missing and the failure could not be reproduced in eleven further
  // runs — consistent with a transient write error that was swallowed as
  // designed. Bounded and short: the change has already happened, and the caller
  // is waiting.
  let lastError: unknown = null
  for (let attempt = 0; attempt < RECORD_ATTEMPTS; attempt++) {
    try {
      await sql`
        INSERT INTO audit_events
          (actor_id, actor_email, action, target_type, target_id, target_label,
           metadata, ip, user_agent, scope_key, changes)
        VALUES (
          ${input.actor.userId ?? null}, ${input.actor.email ?? null}, ${input.action},
          ${input.target.type}, ${String(input.target.id)}, ${input.target.label ?? null},
          ${JSON.stringify(input.context ?? {})}::jsonb,
          ${input.ip ?? null}, ${input.userAgent ?? null},
          ${scopeKey(input.scope)},
          ${JSON.stringify({ before, after, diff: changes })}::jsonb
        )`
      if (attempt > 0) {
        console.warn(`[audit] recorded ${input.action} on attempt ${attempt + 1} after a transient failure`)
      }
      return
    } catch (err) {
      lastError = err
      if (attempt < RECORD_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]))
    }
  }
  // Loud on purpose. See the header.
  console.error(
    `[audit] FAILED to record ${input.action} on ${input.target.type}:${input.target.id} ` +
    `(${scopeKey(input.scope)}) after ${RECORD_ATTEMPTS} attempts — the change happened and is not in the trail:`,
    (lastError as Error)?.message,
  )
}

const RECORD_ATTEMPTS = 3
const RETRY_BACKOFF_MS = [120, 400]

// ─── Snapshots ──────────────────────────────────────────────────────────────

/**
 * The tables recordChange() snapshots, each with a literal query.
 *
 * A switch rather than an interpolated table name: identifiers cannot be
 * parameters, and this helper must never be coercible into reading a table
 * that is not on the list. Adding an entity is adding a case.
 */
export type AuditedTable =
  | "option_grants" | "valuations_409a" | "equity_filings" | "comp_bands"
  | "contracts" | "spvs" | "loans"
  | "kyc_cases" | "kyc_screening_hits" | "kyc_documents"
  | "capital_calls" | "distributions"

export async function snapshotRow(table: AuditedTable, id: string): Promise<Record<string, unknown> | null> {
  try {
    let rows: any[]
    switch (table) {
      case "option_grants":      rows = await sql`SELECT * FROM option_grants WHERE id = ${id}`; break
      case "valuations_409a":    rows = await sql`SELECT * FROM valuations_409a WHERE id = ${id}`; break
      case "equity_filings":     rows = await sql`SELECT * FROM equity_filings WHERE id = ${id}`; break
      case "comp_bands":         rows = await sql`SELECT * FROM comp_bands WHERE id = ${id}`; break
      case "contracts":          rows = await sql`SELECT * FROM contracts WHERE id = ${id}`; break
      case "spvs":               rows = await sql`SELECT * FROM spvs WHERE id = ${id}`; break
      case "loans":              rows = await sql`SELECT * FROM loans WHERE id = ${id}`; break
      case "kyc_cases":          rows = await sql`SELECT * FROM kyc_cases WHERE id = ${id}`; break
      case "kyc_screening_hits": rows = await sql`SELECT * FROM kyc_screening_hits WHERE id = ${id}`; break
      case "kyc_documents":      rows = await sql`SELECT * FROM kyc_documents WHERE id = ${id}`; break
      case "capital_calls":      rows = await sql`SELECT * FROM capital_calls WHERE id = ${id}`; break
      case "distributions":      rows = await sql`SELECT * FROM distributions WHERE id = ${id}`; break
      default: {
        const never: never = table
        return never
      }
    }
    return (rows[0] as Record<string, unknown>) ?? null
  } catch {
    // A snapshot that cannot be read still lets the write proceed; the event is
    // recorded with a null `before`, which is honest about what is known.
    return null
  }
}

// ─── Reading ────────────────────────────────────────────────────────────────

export interface ChangeEvent {
  id: string
  action: string
  actorId: string | null
  actorEmail: string | null
  targetType: string
  targetId: string
  targetLabel: string | null
  diff: Record<string, [unknown, unknown]>
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  createdAt: string
}

function toEvent(r: any): ChangeEvent {
  const c = typeof r.changes === "string" ? JSON.parse(r.changes) : (r.changes ?? {})
  return {
    id: r.id, action: r.action,
    actorId: r.actor_id ?? null, actorEmail: r.actor_email ?? null,
    targetType: r.target_type, targetId: r.target_id, targetLabel: r.target_label ?? null,
    diff: c.diff ?? {}, before: c.before ?? null, after: c.after ?? null,
    // From epoch milliseconds, computed in SQL. Parsing the driver's timestamp
    // string dropped sub-second precision — events in the same second read back
    // as identical, which a trail must not do.
    createdAt: new Date(Number(r.created_ms)).toISOString(),
  }
}

/**
 * One record's whole life, oldest first. Requires the caller's scope, so a
 * tenant can only ever read their own records' history.
 */
export async function listEntityHistory(scope: Scope, targetType: string, targetId: string): Promise<ChangeEvent[]> {
  const rows = await sql`
    SELECT id, action, actor_id, actor_email, target_type, target_id, target_label, changes, created_at,
           (extract(epoch FROM created_at) * 1000)::bigint AS created_ms
    FROM audit_events
    WHERE scope_key = ${scopeKey(scope)} AND target_type = ${targetType} AND target_id = ${String(targetId)}
    ORDER BY created_at ASC, id ASC`
  return (rows as any[]).map(toEvent)
}

/** A tenant's own trail, newest first, cursor-paginated on created_at. */
export async function listScopeActivity(
  scope: Scope,
  opts: { limit?: number; before?: string | null } = {},
): Promise<{ events: ChangeEvent[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const before = opts.before ?? null
  const rows = (await sql`
    SELECT id, action, actor_id, actor_email, target_type, target_id, target_label, changes, created_at,
           (extract(epoch FROM created_at) * 1000)::bigint AS created_ms
    FROM audit_events
    WHERE scope_key = ${scopeKey(scope)}
      AND (${before}::timestamptz IS NULL OR created_at < ${before}::timestamptz)
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit + 1}`) as any[]
  const events = rows.slice(0, limit).map(toEvent)
  return { events, nextCursor: rows.length > limit ? events[events.length - 1]?.createdAt ?? null : null }
}

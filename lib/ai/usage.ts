import { sql } from "@/lib/db"
import { TASKS, type TaskTag } from "./model-router"

/**
 * What the AI actually did.
 *
 * Every AI call already passes through generateDetailed(), which knows the
 * provider that answered, the model, the upstream status and the failure
 * reason — and until now threw all of it away. SAIL could manage keys and
 * task switches but could not observe anything, because nothing was recorded.
 *
 * Three rules this module holds to:
 *
 *   1. **It never throws.** A telemetry write that breaks a match run is worse
 *      than no telemetry. Every path here swallows its own errors, the same
 *      posture as lib/audit/audit-log.ts.
 *
 *   2. **It never blocks.** Recording is fire-and-forget. An AI call already
 *      took hundreds of milliseconds; it must not also wait on a database
 *      round trip to say so.
 *
 *   3. **It stores no prompt or completion text.** This is observability of an
 *      integration, not a transcript of what users asked. Storing the text
 *      would make a metrics table the most sensitive store in the platform,
 *      and nothing in an operations dashboard needs it.
 */

export interface AiCallRecord {
  task?: TaskTag | string | null
  /** The provider that ANSWERED, which differs from the configured one whenever
   *  failover fired — the thing that was previously invisible. */
  provider: string
  model?: string | null
  /** 0 when the first-choice provider answered; 1+ once failover reached this
   *  one. A platform silently running on its third choice looks healthy
   *  without this. */
  attempt?: number
  ok: boolean
  error?: string | null
  httpStatus?: number | null
  durationMs?: number | null
  promptTokens?: number | null
  outputTokens?: number | null
  workspaceId?: string | null
  /** User id from the ambient AiPrincipal. Null for anything running outside a
   *  wrapped request — a cron job has no actor, and inventing one would be
   *  worse than an empty column. */
  actorId?: string | null
  actorEmail?: string | null
  persona?: string | null
}

/** Long errors are usually a provider echoing the request back. The first line
 *  is the diagnosis; the rest is noise that would dominate the table. */
function shortError(error: string | null | undefined): string | null {
  if (!error) return null
  const firstLine = String(error).split("\n")[0].trim()
  return firstLine.slice(0, 300) || null
}

const int = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null

/**
 * Record one call. Fire-and-forget: callers do not await this, and it resolves
 * even when the write fails.
 */
export async function recordAiCall(record: AiCallRecord): Promise<void> {
  try {
    await sql`
      INSERT INTO ai_calls (
        task, provider, model, attempt, ok, error, http_status,
        duration_ms, prompt_tokens, output_tokens, workspace_id, actor_id,
        actor_email, persona
      ) VALUES (
        ${record.task ? String(record.task).slice(0, 64) : null},
        ${String(record.provider).slice(0, 64)},
        ${record.model ? String(record.model).slice(0, 128) : null},
        ${int(record.attempt) ?? 0},
        ${record.ok},
        ${shortError(record.error)},
        ${int(record.httpStatus)},
        ${int(record.durationMs)},
        ${int(record.promptTokens)},
        ${int(record.outputTokens)},
        ${record.workspaceId ?? null},
        ${record.actorId ?? null},
        ${record.actorEmail ?? null},
        ${record.persona ?? null}
      )
    `
  } catch {
    // Deliberately silent. A telemetry failure that logged on every call would
    // turn one broken table into a flooded log, and the caller has real work
    // to finish.
  }
}

// ─── Reading, for the SAIL dashboard ────────────────────────────────────────

export interface AiUsageFilters {
  /** Window in hours, counted back from now. */
  hours?: number
  task?: string | null
  provider?: string | null
  workspaceId?: string | null
}

export interface AiUsageSummary {
  windowHours: number
  totals: {
    calls: number
    failures: number
    failureRate: number
    /** Calls a kill switch stopped before they reached a provider. Counted
     *  apart from failures: an admin turning a task off is not an outage, and
     *  folding the two together would make the failure rate meaningless. */
    suppressed: number
    /** Calls served by something other than the first-choice provider. */
    failovers: number
    promptTokens: number | null
    outputTokens: number | null
    p50DurationMs: number | null
    p95DurationMs: number | null
    /** Calls carrying a principal. Attribution is partial by design — only
     *  work inside withAiContext() has one — and a dashboard that showed a
     *  workspace breakdown without saying what fraction it covers would
     *  invite the reader to treat it as the whole picture. */
    attributed: number
  }
  byTask: Array<{ task: string; calls: number; failures: number; avgDurationMs: number | null; outputTokens: number | null }>
  byProvider: Array<{ provider: string; calls: number; failures: number; failovers: number; avgDurationMs: number | null }>
  recentFailures: Array<{ createdAt: string; task: string | null; provider: string; model: string | null; httpStatus: number | null; error: string | null }>
}

const clampHours = (h: number | undefined) =>
  Math.min(Math.max(Number.isFinite(h) ? Number(h) : 24, 1), 24 * 90)

/**
 * One window, summarised. Every figure is a count of rows rather than an
 * estimate, and a null token total means "no provider in this window reported
 * tokens" rather than zero — the difference matters when the number is used to
 * talk about cost.
 */
export async function aiUsageSummary(filters: AiUsageFilters = {}): Promise<AiUsageSummary> {
  const hours = clampHours(filters.hours)
  const task = filters.task || null
  const provider = filters.provider || null
  const workspaceId = filters.workspaceId || null

  const rows = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE provider <> 'disabled')::int      AS calls,
      COUNT(*) FILTER (WHERE NOT ok AND provider <> 'disabled')::int AS failures,
      COUNT(*) FILTER (WHERE provider = 'disabled')::int       AS suppressed,
      COUNT(*) FILTER (WHERE attempt > 0)::int                 AS failovers,
      COUNT(*) FILTER (WHERE workspace_id IS NOT NULL)::int     AS attributed,
      SUM(prompt_tokens)::bigint                               AS prompt_tokens,
      SUM(output_tokens)::bigint                               AS output_tokens,
      PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50,
      PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95
    FROM ai_calls
    WHERE created_at > now() - (${hours} || ' hours')::interval
      AND (${task}::text IS NULL OR task = ${task})
      AND (${provider}::text IS NULL OR provider = ${provider})
      AND (${workspaceId}::text IS NULL OR workspace_id = ${workspaceId})
  `) as Array<Record<string, unknown>>

  const t = rows[0] ?? {}
  const calls = Number(t.calls ?? 0)
  const failures = Number(t.failures ?? 0)

  const byTask = (await sql`
    SELECT COALESCE(task, '(untagged)') AS task,
           COUNT(*)::int AS calls,
           COUNT(*) FILTER (WHERE NOT ok)::int AS failures,
           AVG(duration_ms)::int AS avg_duration_ms,
           SUM(output_tokens)::bigint AS output_tokens
    FROM ai_calls
    WHERE created_at > now() - (${hours} || ' hours')::interval
      AND (${provider}::text IS NULL OR provider = ${provider})
      AND (${workspaceId}::text IS NULL OR workspace_id = ${workspaceId})
    GROUP BY 1 ORDER BY calls DESC LIMIT 50
  `) as Array<Record<string, unknown>>

  const byProvider = (await sql`
    SELECT provider,
           COUNT(*)::int AS calls,
           COUNT(*) FILTER (WHERE NOT ok)::int AS failures,
           COUNT(*) FILTER (WHERE attempt > 0)::int AS failovers,
           AVG(duration_ms)::int AS avg_duration_ms
    FROM ai_calls
    WHERE created_at > now() - (${hours} || ' hours')::interval
      AND (${task}::text IS NULL OR task = ${task})
      AND (${workspaceId}::text IS NULL OR workspace_id = ${workspaceId})
    GROUP BY 1 ORDER BY calls DESC LIMIT 20
  `) as Array<Record<string, unknown>>

  const recentFailures = (await sql`
    SELECT created_at, task, provider, model, http_status, error
    FROM ai_calls
    WHERE NOT ok
      AND created_at > now() - (${hours} || ' hours')::interval
      AND (${task}::text IS NULL OR task = ${task})
      AND (${provider}::text IS NULL OR provider = ${provider})
      AND (${workspaceId}::text IS NULL OR workspace_id = ${workspaceId})
    ORDER BY created_at DESC LIMIT 25
  `) as Array<Record<string, unknown>>

  const num = (v: unknown) => (v == null ? null : Number(v))

  return {
    windowHours: hours,
    totals: {
      calls,
      failures,
      failureRate: calls ? Number((failures / calls).toFixed(4)) : 0,
      suppressed: Number(t.suppressed ?? 0),
      attributed: Number(t.attributed ?? 0),
      failovers: Number(t.failovers ?? 0),
      promptTokens: num(t.prompt_tokens),
      outputTokens: num(t.output_tokens),
      p50DurationMs: num(t.p50),
      p95DurationMs: num(t.p95),
    },
    byTask: byTask.map((r) => ({
      task: String(r.task),
      calls: Number(r.calls),
      failures: Number(r.failures),
      avgDurationMs: num(r.avg_duration_ms),
      outputTokens: num(r.output_tokens),
    })),
    byProvider: byProvider.map((r) => ({
      provider: String(r.provider),
      calls: Number(r.calls),
      failures: Number(r.failures),
      failovers: Number(r.failovers),
      avgDurationMs: num(r.avg_duration_ms),
    })),
    recentFailures: recentFailures.map((r) => ({
      createdAt: new Date(String(r.created_at)).toISOString(),
      task: r.task ? String(r.task) : null,
      provider: String(r.provider),
      model: r.model ? String(r.model) : null,
      httpStatus: r.http_status == null ? null : Number(r.http_status),
      error: r.error ? String(r.error) : null,
    })),
  }
}

/**
 * Tasks that exist in the router but made no call in the window.
 *
 * A task with a kill switch off and a task nobody happens to use look
 * identical in a usage table — both are simply absent. Listing the known set
 * alongside what ran is what makes an admin able to tell the difference.
 */
export function idleTasks(byTask: AiUsageSummary["byTask"]): string[] {
  const seen = new Set(byTask.map((t) => t.task))
  return TASKS.filter((t) => !seen.has(t))
}

/** Rows older than this are deleted by the retention job. Ninety days is long
 *  enough to compare a month against the one before it. */
export const RETENTION_DAYS = 90

export async function pruneAiCalls(days = RETENTION_DAYS): Promise<number> {
  try {
    const rows = (await sql`
      DELETE FROM ai_calls
      WHERE created_at < now() - (${Math.max(1, Math.round(days))} || ' days')::interval
      RETURNING 1
    `) as unknown[]
    return rows.length
  } catch {
    return 0
  }
}

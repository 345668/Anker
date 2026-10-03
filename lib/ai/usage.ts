import { sql } from "@/lib/db"
import { TASKS, type TaskTag } from "./model-router"
import { costOf } from "./model-catalog"
import { currentRunId } from "@/lib/assistant/context"
import { logEvent } from "@/lib/observability/log"

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
  /** Which of doc 29 §5's rules chose the model (doc 30). Passed, never
   *  inferred from `provider`/`model`: a user's honoured pick and an internal
   *  caller pinning a provider arrive through the same option, so a derived
   *  value would conflate "a user chose Qwen" with "the pipeline pins Qwen". */
  resolution?: AiResolution | null
  /** The id the USER asked for, set only when a user expressed a preference —
   *  so a non-null here is the population "a pick was made". Differs from
   *  `model`, which is what answered. */
  requestedModel?: string | null
  /** Served by generateStream rather than the blocking path. Until doc 30 a
   *  successful stream recorded nothing at all, so every pre-existing row is
   *  correctly false. */
  streamed?: boolean | null
  /** The run this call belongs to. Taken from the ambient run when not given. */
  runId?: string | null
  /** Cost at the time of the call. Computed from tokens and the catalogue price when not given; null when unpriced. */
  costUsd?: number | null
}

/**
 * Doc 29 §5's resolution order, as far as it exists. `surface` is reserved for
 * phase 2's `surfaces[surface]` rule and is unreachable until then — carried
 * here, and stored as text, so that phase needs no migration.
 *
 * `pinned` is not one of §5's four rules: it is an internal caller passing an
 * explicit `provider` for its own reasons, which is a code-level decision rather
 * than a routing one. It earns a value of its own so that a NULL `resolution`
 * means exactly "written before doc 30" and nothing else — otherwise the
 * coverage figure would count undeclared call sites as missing data.
 */
export type AiResolution = "request" | "surface" | "global" | "auto" | "pinned"

/** Providers that are not providers: rows recording that no provider was asked.
 *  Both are working-as-designed outcomes, so neither counts as a failure. */
export const PSEUDO_PROVIDERS = ["disabled", "rejected"] as const

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
  const runId = record.runId ?? currentRunId()
  const costUsd = record.costUsd !== undefined ? record.costUsd : costOf(record.model, { promptTokens: record.promptTokens ?? undefined, outputTokens: record.outputTokens ?? undefined })
  logEvent("ai_call", { provider: record.provider, model: record.model ?? null, task: record.task ? String(record.task) : null, ok: record.ok, ms: int(record.durationMs), in_tok: int(record.promptTokens), out_tok: int(record.outputTokens), cost_usd: costUsd === null ? null : Number(costUsd.toFixed(6)), status: int(record.httpStatus), attempt: int(record.attempt) ?? 0 }, runId)
  try {
    await sql`
      INSERT INTO ai_calls (
        task, provider, model, attempt, ok, error, http_status,
        duration_ms, prompt_tokens, output_tokens, workspace_id, actor_id,
        actor_email, persona, resolution, requested_model, streamed, run_id, cost_usd
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
        ${record.persona ?? null},
        ${record.resolution ?? null},
        ${record.requestedModel ? String(record.requestedModel).slice(0, 128) : null},
        ${record.streamed ?? false},
        ${runId},
        ${costUsd === null ? null : Number(costUsd.toFixed(6))}
      )
    `
  } catch {
    // Deliberately silent. A telemetry failure that logged on every call would
    // turn one broken table into a flooded log, and the caller has real work
    // to finish.
  }
}

/**
 * Record that a user's model pick was refused. Doc 30 §1.4.
 *
 * Called from the ROUTE, once per request, not from provider.ts. recordAiCall
 * fires once per chain attempt and an agent run makes many calls, so recording a
 * refusal there would multiply one user's refused pick by the failover depth and
 * the step count — inflating the number most when the platform is least healthy,
 * which is precisely when it would be read.
 *
 * Written as the `rejected` pseudo-provider, the convention `disabled` already
 * established: no provider was asked, so this is not an outage and must not
 * count as a failure (see the read side below).
 */
export async function recordRejectedPick(input: {
  requested: string
  reason: string
  task?: TaskTag | string | null
  workspaceId?: string | null
  actorId?: string | null
  persona?: string | null
}): Promise<void> {
  return recordAiCall({
    provider: "rejected",
    ok: false,
    error: input.reason,
    requestedModel: input.requested,
    task: input.task ?? null,
    workspaceId: input.workspaceId ?? null,
    actorId: input.actorId ?? null,
    persona: input.persona ?? null,
  })
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
    /** Model picks the catalogue refused. Like `suppressed`, counted apart from
     *  failures: nothing failed, a user asked for something unusable. Doc 30. */
    rejectedPicks: number
    /** Calls served by the streaming path. Zero for any window before doc 30,
     *  when streamed calls were not recorded at all — so a window spanning that
     *  change under-reports them rather than reporting nothing. */
    streamed: number
    /** Rows whose `resolution` is known. Null for everything written before
     *  doc 30, and reported for the same reason `attributed` is: a provenance
     *  breakdown over a window that is half pre-migration would otherwise read
     *  as though one rule had stopped being used. */
    provenanceKnown: number
    /** Calls that reported token counts. Zero for every window before doc 33,
     *  when nothing parsed a provider's usage block — so a window spanning that
     *  change under-reports rather than reporting nothing. This is the
     *  denominator for `estimatedCostUsd`: without it, a small figure cannot be
     *  told from an unmeasured one. */
    tokenised: number
    /** Estimated spend over the window, from tokens × catalogue price. Covers
     *  `tokenised` calls on priced models only — frontier models carry no price
     *  (doc 32 §1.3), so this is a floor, never a total. */
    estimatedCostUsd: number | null
  }
  byTask: Array<{ task: string; calls: number; failures: number; avgDurationMs: number | null; outputTokens: number | null }>
  byProvider: Array<{ provider: string; calls: number; failures: number; failovers: number; avgDurationMs: number | null }>
  /** Which rule chose the model, over the rows that say. Doc 29 §5. */
  byResolution: Array<{ resolution: string; calls: number }>
  /** Refused picks, by reason and by the id that was asked for. A model
   *  appearing here repeatedly is the catalogue and the picker disagreeing,
   *  which is doc 29's N5 recurring. */
  rejectedByReason: Array<{ reason: string; requestedModel: string | null; count: number }>
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

  // `provider NOT IN ('disabled','rejected')` is the population "a provider was
  // actually asked". Both pseudo-providers carry ok = false, so counting either
  // as a failure would inflate the failure rate with something working exactly as
  // designed — and it would do so invisibly, since the number stays plausible.
  const rows = (await sql`
    SELECT
      COUNT(*) FILTER (WHERE provider NOT IN ('disabled','rejected'))::int AS calls,
      COUNT(*) FILTER (WHERE NOT ok AND provider NOT IN ('disabled','rejected'))::int AS failures,
      COUNT(*) FILTER (WHERE provider = 'disabled')::int       AS suppressed,
      COUNT(*) FILTER (WHERE provider = 'rejected')::int        AS rejected_picks,
      COUNT(*) FILTER (WHERE attempt > 0)::int                 AS failovers,
      COUNT(*) FILTER (WHERE workspace_id IS NOT NULL)::int     AS attributed,
      COUNT(*) FILTER (WHERE streamed)::int                      AS streamed,
      COUNT(*) FILTER (WHERE resolution IS NOT NULL)::int        AS provenance_known,
      COUNT(*) FILTER (WHERE prompt_tokens IS NOT NULL OR output_tokens IS NOT NULL)::int AS tokenised,
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

  // Same exclusion as the totals: a task whose picks were refused has not failed.
  // byProvider below is left alone deliberately — it groups BY provider, so the
  // pseudo-providers show up as their own rows, which is where they belong.
  const byTask = (await sql`
    SELECT COALESCE(task, '(untagged)') AS task,
           COUNT(*)::int AS calls,
           COUNT(*) FILTER (WHERE NOT ok AND provider NOT IN ('disabled','rejected'))::int AS failures,
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

  // Spend is priced in JS, not SQL: the prices live in the catalogue
  // (lib/ai/model-catalog.ts), which is TypeScript and deliberately importable by
  // the client, so there is no price table to join against. Grouping by model
  // first keeps this to one row per model rather than one per call.
  const byModelTokens = (await sql`
    SELECT model, SUM(prompt_tokens)::bigint AS prompt_tokens, SUM(output_tokens)::bigint AS output_tokens
    FROM ai_calls
    WHERE model IS NOT NULL
      AND (prompt_tokens IS NOT NULL OR output_tokens IS NOT NULL)
      AND created_at > now() - (${hours} || ' hours')::interval
      AND (${task}::text IS NULL OR task = ${task})
      AND (${provider}::text IS NULL OR provider = ${provider})
      AND (${workspaceId}::text IS NULL OR workspace_id = ${workspaceId})
    GROUP BY 1
  `) as Array<Record<string, unknown>>

  let estimatedCostUsd: number | null = null
  for (const r of byModelTokens) {
    const cost = costOf(String(r.model), {
      promptTokens: r.prompt_tokens == null ? undefined : Number(r.prompt_tokens),
      outputTokens: r.output_tokens == null ? undefined : Number(r.output_tokens),
    })
    // An unpriced model contributes nothing rather than zero — the figure is a
    // floor over priced models, and `tokenised` above says how much it covers.
    if (cost !== null) estimatedCostUsd = (estimatedCostUsd ?? 0) + cost
  }

  // Which rule chose the model. Only rows that say: NULL is "written before
  // doc 30", and totals.provenanceKnown is what tells the reader how much of the
  // window this covers.
  const byResolution = (await sql`
    SELECT resolution, COUNT(*)::int AS calls
    FROM ai_calls
    WHERE resolution IS NOT NULL
      AND created_at > now() - (${hours} || ' hours')::interval
      AND (${task}::text IS NULL OR task = ${task})
      AND (${provider}::text IS NULL OR provider = ${provider})
      AND (${workspaceId}::text IS NULL OR workspace_id = ${workspaceId})
    GROUP BY 1 ORDER BY calls DESC LIMIT 10
  `) as Array<Record<string, unknown>>

  // Refused picks, grouped the way the question is asked: which model, refused
  // why. A model recurring here is the catalogue and the picker disagreeing.
  const rejectedByReason = (await sql`
    SELECT COALESCE(error, '(unknown)') AS reason, requested_model, COUNT(*)::int AS count
    FROM ai_calls
    WHERE provider = 'rejected'
      AND created_at > now() - (${hours} || ' hours')::interval
      AND (${task}::text IS NULL OR task = ${task})
      AND (${workspaceId}::text IS NULL OR workspace_id = ${workspaceId})
    GROUP BY 1, 2 ORDER BY count DESC LIMIT 25
  `) as Array<Record<string, unknown>>

  // Real failures only. Both pseudo-providers are excluded for the same reason
  // the totals exclude them — nothing failed. 'disabled' was being listed here
  // as a failure before doc 30, which contradicted totals.suppressed sitting
  // deliberately apart from totals.failures; that is corrected here rather than
  // left to look like a new inconsistency introduced by 'rejected'.
  const recentFailures = (await sql`
    SELECT created_at, task, provider, model, http_status, error
    FROM ai_calls
    WHERE NOT ok
      AND provider NOT IN ('disabled','rejected')
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
      rejectedPicks: Number(t.rejected_picks ?? 0),
      streamed: Number(t.streamed ?? 0),
      provenanceKnown: Number(t.provenance_known ?? 0),
      tokenised: Number(t.tokenised ?? 0),
      estimatedCostUsd: estimatedCostUsd === null ? null : Number(estimatedCostUsd.toFixed(6)),
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
    byResolution: byResolution.map((r) => ({
      resolution: String(r.resolution),
      calls: Number(r.calls),
    })),
    rejectedByReason: rejectedByReason.map((r) => ({
      reason: String(r.reason),
      requestedModel: r.requested_model ? String(r.requested_model) : null,
      count: Number(r.count),
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

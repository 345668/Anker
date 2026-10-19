/**
 * One way to run LP matchmaking (docs/architecture/63 section 4.1).
 *
 * The matchmaking page, Anker AI, agents and Telegram all come through here, so the same fund profile, options and mandate give the same ranked list wherever
 * it is asked for. The engine itself (lib/matching/v2) is unchanged; this adds what a workspace needs around it: the profile resolved inside the workspace, the
 * fund's own rules, the hard exclusions, and a saved run that every member of the workspace can see.
 */
import { createHash, randomUUID } from "node:crypto"
import { sql } from "@/lib/db"
import { toFundProfile } from "@/lib/matching/fund-profile"
import { fundReadiness, runOptionsSchema } from "@/lib/matching/profile-readiness"
import { EMPTY_FILTERS, describeFilters, hasFilters, parseFilters, INVESTOR_CLASSES, type InvestorClass, type MatchFilters } from "@/lib/matching/filters"
import { runLpMatchingV2 } from "@/lib/matching/v2/engine"
import { saveSessionV2 } from "@/lib/matching/v2/persistence"
import type { FundProfileV2, MatchingResultV2 } from "@/lib/matching/v2/types"
import { loadLpRuleData } from "./rules-load"
import { DONE, QUEUED, RULES, SAVING, fromEngineEvent, throttled, type Progress } from "./progress"
import { buildLpRules, describeExclusions, type LpRuleData, type LpRules } from "./rules"

export type LpMatchSource = "page" | "assistant" | "telegram" | "agent"
export interface LpMatchScope { orgId: string; userId: string; source: LpMatchSource; /** Where the person is waiting, when it is not the app: the finished run is sent there if they stop waiting. */ channel?: "telegram" }
export interface LpMatchInput {
  /** A specific profile of the workspace; omitted = the workspace's active profile (the most recently updated). */
  fundProfileId?: string
  options?: { minScore?: number; maxFirms?: number; maxContacts?: number; enableAi?: boolean }
  /** The mandate (doc 26); anything unreadable is dropped by parseFilters. */
  mandate?: unknown
  /** Show LPs already in the CRM instead of leaving them out. */
  includeKnown?: boolean
  /** The run this one refines (docs/architecture/63 M4). */
  parentSessionId?: string | null
}
export class LpMatchError extends Error {
  constructor(message: string, readonly status = 409, readonly missingFields?: unknown) { super(message); this.name = "LpMatchError" }
}
export interface LpMatchOutcome {
  result: MatchingResultV2
  fund: FundProfileV2
  filters: MatchFilters
  filterSummary: string
  exclusionSummary: string
}

export interface LpMatchDeps {
  run: typeof runLpMatchingV2
  save: typeof saveSessionV2
  loadRules: (scope: { orgId: string; userId: string }, o: { excludedJurisdictions?: string[]; includeKnown?: boolean }) => Promise<LpRuleData>
}
const defaultDeps: LpMatchDeps = { run: runLpMatchingV2, save: saveSessionV2, loadRules: loadLpRuleData }

/** The workspace's profile: the one asked for, or the active one updated most recently. Never another workspace's. */
export async function resolveFundProfile(scope: { orgId: string }, id?: string | null): Promise<any | null> {
  const rows = id
    ? await sql`SELECT * FROM fund_profiles WHERE id = ${id} AND org_id = ${scope.orgId} AND is_active = true LIMIT 1`
    : await sql`SELECT * FROM fund_profiles WHERE org_id = ${scope.orgId} AND is_active = true ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1`
  return (rows as any[])[0] ?? null
}

/** The fund's allowed LP classes narrow the mandate; a mandate that asks only for classes the fund does not allow is refused, not silently emptied. */
export function applyFundRules(mandate: MatchFilters, allowed: string[] | undefined): MatchFilters {
  const ok = (allowed ?? []).filter((c): c is InvestorClass => (INVESTOR_CLASSES as readonly string[]).includes(c))
  if (!ok.length) return mandate
  if (!mandate.classes.length) return { ...mandate, classes: ok }
  const both = mandate.classes.filter((c) => ok.includes(c))
  if (!both.length) throw new LpMatchError(`The classes you asked for are not among those your fund approaches (${ok.join(", ")}). Change the fund's rules or the mandate.`, 422)
  return { ...mandate, classes: both }
}

// ─── The life of a run (docs/architecture/63 section 4.1) ───────────────────────────────────────────────────
// A run is a row from the moment it is asked for: queued, running (with a heartbeat and a report of where it is), then completed or failed.
// Everything the worker needs is on the row, so the request that started it, the background hand-off and the once-a-minute sweep can all do the work.

export const MAX_ATTEMPTS = 3
/** A running run whose heartbeat is older than this lost its worker. */
export const STALE_AFTER_S = 90
/** A queued run nobody took up within this long is picked up by the sweep. */
export const QUEUED_AFTER_S = 20

export interface StartedRun { sessionId: string; existing: boolean }
const hashOf = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 32)
const jf = (v: any) => (v == null ? null : typeof v === "string" ? (() => { try { return JSON.parse(v) } catch { return null } })() : v)

/**
 * Check the request, write the run as queued and return its id. Nothing is computed yet. A request that repeats one still queued or running (a double click, a retry),
 * or one that finished in the last half minute, gets that run back instead of a second one; a later repeat is a new run, because the workspace's CRM and exclusions may
 * have changed the answer.
 */
export async function startLpMatch(scope: LpMatchScope, input: LpMatchInput = {}): Promise<StartedRun> {
  const options = runOptionsSchema.safeParse(input.options ?? {})
  if (!options.success) throw new LpMatchError("Use a score between 0 and 100 and result limits between 1 and 20,000.", 422)

  const row = await resolveFundProfile(scope, input.fundProfileId)
  if (!row) throw new LpMatchError(input.fundProfileId ? "Fund profile not found in this workspace." : "This workspace has no fund profile yet.", input.fundProfileId ? 404 : 409)
  const fund = toFundProfile(row)
  const missing = fundReadiness(fund)
  if (missing.length) throw new LpMatchError("Complete the required fund fields before matching.", 422, missing)

  const filters = applyFundRules(parseFilters(input.mandate) ?? EMPTY_FILTERS, fund.allowedLpClasses)
  const runOptions = { minScore: options.data.minScore, maxFirms: options.data.maxFirms, maxContacts: options.data.maxContacts, enableAi: options.data.enableAi, includeKnown: !!input.includeKnown }
  const hash = hashOf({ org: scope.orgId, fund: fund.id, updated: String(row.updated_at ?? ""), filters, runOptions, parent: input.parentSessionId ?? null })

  const [dup] = (await sql`SELECT id FROM lp_match_sessions WHERE org_id = ${scope.orgId} AND inputs_hash = ${hash}
    AND ((status IN ('queued', 'running') AND created_at > now() - interval '10 minutes') OR (status = 'completed' AND finished_at > now() - interval '30 seconds'))
    ORDER BY created_at DESC LIMIT 1`) as any[]
  if (dup) return { sessionId: String(dup.id), existing: true }

  const id = randomUUID()
  // One open run per workspace and inputs, enforced by a unique index: two requests at the same moment cannot both insert.
  const made = (await sql`INSERT INTO lp_match_sessions (id, fund_profile_id, fund_name, user_id, org_id, source, status, filters_applied, run_options, parent_session_id, inputs_hash, progress, notify, engine_version, created_at)
    VALUES (${id}, ${fund.id}, ${fund.name}, ${scope.userId}, ${scope.orgId}, ${scope.source}, 'queued', ${JSON.stringify(filters)}::jsonb, ${JSON.stringify(runOptions)}::jsonb, ${input.parentSessionId ?? null}, ${hash},
      ${JSON.stringify(QUEUED)}::jsonb, ${scope.channel ? JSON.stringify({ channel: scope.channel }) : null}::jsonb, 'v2', now())
    ON CONFLICT (org_id, inputs_hash) WHERE status IN ('queued', 'running') DO NOTHING RETURNING id`) as any[]
  if (!made.length) {
    const [open] = (await sql`SELECT id FROM lp_match_sessions WHERE org_id = ${scope.orgId} AND inputs_hash = ${hash} AND status IN ('queued', 'running') ORDER BY created_at DESC LIMIT 1`) as any[]
    if (open) return { sessionId: String(open.id), existing: true }
    throw new LpMatchError("The run could not be started. Please try again.", 503)
  }
  return { sessionId: id, existing: false }
}

async function writeProgress(id: string, p: Progress) {
  await sql`UPDATE lp_match_sessions SET progress = ${JSON.stringify(p)}::jsonb, heartbeat_at = now() WHERE id::text = ${id} AND status = 'running'`
}

/**
 * Do the work of one queued run: claim it, run the engine under the workspace's rules, save the results into the same row, and finish it. Returns null when another worker
 * holds it or it is already finished. A failure puts it back in the queue for the sweep until it has been tried MAX_ATTEMPTS times, then fails it; the error is also thrown, so a
 * caller that waited sees it at once.
 */
export async function processLpSession(sessionId: string, deps: LpMatchDeps = defaultDeps): Promise<LpMatchOutcome | null> {
  const [s] = (await sql`UPDATE lp_match_sessions SET status = 'running', attempts = attempts + 1, started_at = COALESCE(started_at, now()), heartbeat_at = now(), progress = ${JSON.stringify(RULES)}::jsonb, error = NULL
    WHERE id::text = ${sessionId} AND status = 'queued' RETURNING *`) as any[]
  if (!s) return null
  const orgId = String(s.org_id), userId = String(s.user_id)
  const beat = setInterval(() => { void sql`UPDATE lp_match_sessions SET heartbeat_at = now() WHERE id::text = ${sessionId} AND status = 'running'`.catch(() => {}) }, 15_000)
  try {
    // A second attempt starts clean: whatever a worker that died had written is removed.
    if (Number(s.attempts) > 1) {
      await sql`DELETE FROM lp_firm_matches WHERE session_id::text = ${sessionId}`
      await sql`DELETE FROM lp_contact_matches WHERE session_id::text = ${sessionId}`
    }
    const row = await resolveFundProfile({ orgId }, String(s.fund_profile_id))
    if (!row) throw new LpMatchError("The fund profile for this run is gone.", 404)
    const fund = toFundProfile(row)
    const filters = parseFilters(jf(s.filters_applied)) ?? EMPTY_FILTERS
    const o = jf(s.run_options) ?? {}
    const ruleData = await deps.loadRules({ orgId, userId }, { excludedJurisdictions: fund.excludedJurisdictions, includeKnown: !!o.includeKnown })
    const rules: LpRules = buildLpRules(ruleData)
    const w = throttled((p) => writeProgress(sessionId, p))
    const result = await deps.run(fund, {
      minScore: o.minScore, maxFirms: o.maxFirms, maxContacts: o.maxContacts, enableAi: o.enableAi, filters, rules, sessionId,
      onProgress: (e) => { const p = fromEngineEvent(e); if (p) w.push(p) },
    })
    w.push(SAVING); await w.flush()
    await deps.save(result, userId, { orgId, source: s.source, filters, parentSessionId: s.parent_session_id ?? null, options: o, sessionId })
    const [done] = (await sql`UPDATE lp_match_sessions SET status = 'completed', progress = ${JSON.stringify(DONE)}::jsonb, finished_at = now(), heartbeat_at = now(), error = NULL
      WHERE id::text = ${sessionId} AND status IN ('running', 'completed') RETURNING handed_off`) as any[]
    if (done?.handed_off) { try { await (await import("./delivery")).deliverRun(sessionId) } catch { /* delivery is a convenience */ } }
    return {
      result, fund, filters,
      filterSummary: hasFilters(filters) ? describeFilters(filters) : "",
      exclusionSummary: result.exclusions ? describeExclusions(result.exclusions) : "",
    }
  } catch (e: any) {
    const final = Number(s.attempts) >= MAX_ATTEMPTS
    const message = String(e?.message ?? e).slice(0, 300)
    const plain = e instanceof LpMatchError  // a refusal that retrying cannot change
    await sql`UPDATE lp_match_sessions SET status = ${final || plain ? "failed" : "queued"}, error = ${message}, progress = ${JSON.stringify(final || plain ? { phase: "failed", label: "Did not finish", pct: 0 } : QUEUED)}::jsonb,
      finished_at = ${final || plain ? new Date().toISOString() : null}::timestamptz WHERE id::text = ${sessionId}`.catch(() => {})
    if ((final || plain)) { try { await (await import("./delivery")).deliverRun(sessionId) } catch { /* ignore */ } }
    throw e
  } finally {
    clearInterval(beat)
  }
}

/** The run as it stands, for the person watching it. Scoped to the workspace, whatever the status. */
export async function sessionStatus(orgId: string, sessionId: string): Promise<{ id: string; status: string; progress: Progress | null; error: string | null; fundName: string; source: string; startedBy: string | null; createdAt: string } | null> {
  const [s] = (await sql`SELECT s.id, s.status, s.progress, s.error, s.fund_name, s.source, s.user_id, s.created_at FROM lp_match_sessions s LEFT JOIN fund_profiles f ON f.id = s.fund_profile_id
    WHERE s.id::text = ${sessionId} AND COALESCE(s.org_id, f.org_id) = ${orgId} LIMIT 1`) as any[]
  if (!s) return null
  return { id: String(s.id), status: String(s.status), progress: jf(s.progress), error: s.error ?? null, fundName: s.fund_name ?? "", source: s.source ?? "page", startedBy: s.user_id ? String(s.user_id) : null, createdAt: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at) }
}

/** The newest run of the workspace that is still queued or running, if it is recent: what a page opened mid-run should show. */
export async function activeSession(orgId: string): Promise<{ id: string; status: string; progress: Progress | null; fundName: string; source: string } | null> {
  const [s] = (await sql`SELECT s.id, s.status, s.progress, s.fund_name, s.source FROM lp_match_sessions s LEFT JOIN fund_profiles f ON f.id = s.fund_profile_id
    WHERE COALESCE(s.org_id, f.org_id) = ${orgId} AND s.status IN ('queued', 'running') AND s.created_at > now() - interval '15 minutes' ORDER BY s.created_at DESC LIMIT 1`) as any[]
  return s ? { id: String(s.id), status: String(s.status), progress: jf(s.progress), fundName: s.fund_name ?? "", source: s.source ?? "page" } : null
}

async function sleep(ms: number) { await new Promise((r) => setTimeout(r, ms)) }
/** Wait for a run to finish, up to `ms`. Returns its final row, or the latest if time ran out. */
async function waitFor(orgId: string, sessionId: string, ms: number) {
  const until = Date.now() + ms
  for (;;) {
    const st = await sessionStatus(orgId, sessionId)
    if (!st || st.status === "completed" || st.status === "failed" || Date.now() >= until) return st
    await sleep(400)
  }
}

/** A finished run read back as an outcome, for a caller that did not do the work itself. */
async function outcomeOf(orgId: string, sessionId: string): Promise<LpMatchOutcome> {
  const { loadSessionResult } = await import("./session-result")
  const l = await loadSessionResult(orgId, sessionId)
  if (!l) throw new LpMatchError("The run finished but could not be read back.", 500)
  const filters = parseFilters(jf(l.session.filters_applied)) ?? EMPTY_FILTERS
  return { result: l.result, fund: l.fund, filters, filterSummary: hasFilters(filters) ? describeFilters(filters) : "", exclusionSummary: l.result.exclusions ? describeExclusions(l.result.exclusions) : "" }
}

/** Run to the end and return the outcome. */
export async function runLpMatch(scope: LpMatchScope, input: LpMatchInput = {}, deps: LpMatchDeps = defaultDeps): Promise<LpMatchOutcome> {
  const { sessionId } = await startLpMatch(scope, input)
  const mine = await processLpSession(sessionId, deps)
  if (mine) return mine
  // Another worker has it (a repeat of a request already running), or it has just finished: wait for it.
  const st = await waitFor(scope.orgId, sessionId, 240_000)
  if (st?.status === "completed") return outcomeOf(scope.orgId, sessionId)
  throw new LpMatchError(st?.status === "failed" ? (st.error ?? "The run did not finish.") : "The run is taking longer than expected. It continues in the background; see the Matchmaking page.", 409)
}

export type Handoff = { kind: "done"; sessionId: string; outcome: LpMatchOutcome | null } | { kind: "running"; sessionId: string; progress: Progress | null }

/**
 * Start a run and wait up to `waitMs` for it. If it finishes in that time the caller gets the result; if not, the run is marked as handed off, keeps going in the background
 * (the platform is asked to keep the invocation alive), and the person is told when it finishes. Whoever asked can come back to it by its id.
 */
export async function runWithHandoff(scope: LpMatchScope, input: LpMatchInput, opts: { waitMs: number; deps?: LpMatchDeps; keepAlive?: (p: Promise<unknown>) => void }): Promise<Handoff> {
  const deps = opts.deps ?? defaultDeps
  const { sessionId } = await startLpMatch(scope, input)
  const work = processLpSession(sessionId, deps).catch((e) => { if (!(e instanceof LpMatchError)) console.error("[lp-match] run failed:", String(e?.message ?? e).slice(0, 200)); throw e })
  work.catch(() => {})  // judged below; never an unhandled rejection
  const timeout = Symbol("timeout")
  const first = await Promise.race([work, sleep(opts.waitMs).then(() => timeout)]).catch((e) => { throw e })
  if (first !== timeout) {
    if (first) return { kind: "done", sessionId, outcome: first as LpMatchOutcome }
    // Someone else holds it (a repeated request): wait out the same time, then hand off.
    const st = await waitFor(scope.orgId, sessionId, opts.waitMs)
    if (st?.status === "completed") return { kind: "done", sessionId, outcome: null }
    if (st?.status === "failed") throw new LpMatchError(st.error ?? "The run did not finish.", 409)
  }
  const [h] = (await sql`UPDATE lp_match_sessions SET handed_off = true WHERE id::text = ${sessionId} AND status IN ('queued', 'running') RETURNING id`) as any[]
  if (!h) {
    // It finished while we were deciding.
    const st = await sessionStatus(scope.orgId, sessionId)
    if (st?.status === "failed") throw new LpMatchError(st.error ?? "The run did not finish.", 409)
    return { kind: "done", sessionId, outcome: null }
  }
  if (opts.keepAlive) opts.keepAlive(work.catch(() => {}))
  else { try { const { after } = await import("next/server"); after(work.catch(() => {})) } catch { /* outside a request (a script, a test): the work continues in this process */ } }
  const st = await sessionStatus(scope.orgId, sessionId)
  return { kind: "running", sessionId, progress: st?.progress ?? null }
}

export interface SweepStats { resumed: number; failed: number; started: number; delivered: number }
/**
 * The once-a-minute sweep: a running run whose heartbeat stopped goes back in the queue (or fails after its last try), a run nobody took up is done here, and a hand-off whose
 * message was not sent is sent. Bounded, so one sweep cannot run for long.
 */
export async function sweepLpSessions(deps: LpMatchDeps = defaultDeps, opts: { maxRuns?: number } = {}): Promise<SweepStats> {
  const st: SweepStats = { resumed: 0, failed: 0, started: 0, delivered: 0 }
  const lost = (await sql`SELECT id, attempts FROM lp_match_sessions WHERE status = 'running' AND COALESCE(heartbeat_at, started_at, created_at) < now() - make_interval(secs => ${STALE_AFTER_S})`) as any[]
  for (const r of lost) {
    if (Number(r.attempts) >= MAX_ATTEMPTS) {
      const f = (await sql`UPDATE lp_match_sessions SET status = 'failed', error = 'The run did not finish after three tries.', finished_at = now(), progress = ${JSON.stringify({ phase: "failed", label: "Did not finish", pct: 0 })}::jsonb WHERE id = ${r.id} AND status = 'running' RETURNING id`) as any[]
      st.failed += f.length
    } else {
      const q = (await sql`UPDATE lp_match_sessions SET status = 'queued', progress = ${JSON.stringify(QUEUED)}::jsonb WHERE id = ${r.id} AND status = 'running' RETURNING id`) as any[]
      st.resumed += q.length
    }
  }
  const waiting = (await sql`SELECT id FROM lp_match_sessions WHERE status = 'queued' AND created_at < now() - make_interval(secs => ${QUEUED_AFTER_S}) ORDER BY created_at LIMIT ${opts.maxRuns ?? 2}`) as any[]
  for (const r of waiting) {
    try { if (await processLpSession(String(r.id), deps)) st.started++ } catch { /* recorded on the run; the next sweep retries */ }
  }
  const owed = (await sql`SELECT id FROM lp_match_sessions WHERE handed_off AND delivered_at IS NULL AND status IN ('completed', 'failed') AND COALESCE(finished_at, created_at) > now() - interval '1 hour' LIMIT 20`) as any[]
  const { deliverRun } = await import("./delivery")
  for (const r of owed) { try { if (await deliverRun(String(r.id))) st.delivered++ } catch { /* tried again next sweep only if still undelivered */ } }
  return st
}

export interface RefineChanges { countries?: string[]; regions?: string[]; classes?: string[]; excludeClasses?: string[]; sectors?: string[] }
export interface RefineOutcome extends LpMatchOutcome {
  parentSessionId: string
  addedFirms: string[]; droppedFirms: string[]; addedCount: number; droppedCount: number
}

async function refineInput(scope: LpMatchScope, input: { sessionId?: string | null; changes: RefineChanges; includeKnown?: boolean; options?: LpMatchInput["options"] }) {
  const { latestSession, sessionInWorkspace } = await import("./matches")
  const parent = input.sessionId ? await sessionInWorkspace(scope.orgId, input.sessionId) : await latestSession(scope.orgId)
  if (!parent) throw new LpMatchError("There is no finished matching run in this workspace to refine. Run the matching first.", 409)
  const base = parseFilters(parent.filters_applied) ?? EMPTY_FILTERS
  const merged: Record<string, unknown> = { ...base }
  for (const k of ["countries", "regions", "classes", "excludeClasses", "sectors"] as const) if (input.changes[k] !== undefined) merged[k] = input.changes[k]
  const before = (await sql`SELECT firm_id::text AS id, firm_name AS name FROM lp_firm_matches WHERE session_id = ${parent.id}`) as any[]
  const runInput: LpMatchInput = { fundProfileId: String(parent.fund_profile_id), mandate: merged, includeKnown: input.includeKnown, options: input.options, parentSessionId: String(parent.id) }
  return { parentId: String(parent.id), runInput, before }
}
function refinedFrom(out: LpMatchOutcome, parentId: string, before: any[]): RefineOutcome {
  const prev = new Map(before.map((r) => [String(r.id), String(r.name)]))
  const now = new Map(out.result.firms.map((f) => [String(f.firmId), f.name]))
  const addedFirms = [...now].filter(([id]) => !prev.has(id)).map(([, n]) => n)
  const droppedFirms = [...prev].filter(([id]) => !now.has(id)).map(([, n]) => n)
  return { ...out, parentSessionId: parentId, addedFirms, droppedFirms, addedCount: addedFirms.length, droppedCount: droppedFirms.length }
}

/**
 * Run the last finished run again with a changed mandate (docs/architecture/63 M4, "only Europe"). A key that is given replaces that part of the mandate (an empty list clears
 * it); keys not given stay as they were. The new run is saved as its own, pointing at the one it refines, and the difference in firms is reported.
 */
export async function refineLpMatch(scope: LpMatchScope, input: { sessionId?: string | null; changes: RefineChanges; includeKnown?: boolean; options?: LpMatchInput["options"] }, deps: LpMatchDeps = defaultDeps): Promise<RefineOutcome> {
  const r = await refineInput(scope, input)
  return refinedFrom(await runLpMatch(scope, r.runInput, deps), r.parentId, r.before)
}

/** The same, but a run that outlasts `waitMs` is handed off and the caller is told it is still going. */
export async function refineWithHandoff(scope: LpMatchScope, input: { sessionId?: string | null; changes: RefineChanges; includeKnown?: boolean; options?: LpMatchInput["options"] }, waitMs: number, deps: LpMatchDeps = defaultDeps): Promise<({ kind: "done" } & RefineOutcome) | { kind: "running"; sessionId: string; progress: Progress | null }> {
  const r = await refineInput(scope, input)
  const h = await runWithHandoff(scope, r.runInput, { waitMs, deps })
  if (h.kind === "running") return h
  return { kind: "done", ...refinedFrom(h.outcome ?? (await outcomeOf(scope.orgId, h.sessionId)), r.parentId, r.before) }
}

export { outcomeOf as loadOutcome }

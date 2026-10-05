/**
 * The agent runtime: durable, resumable runs of definitions, with dry-run and kill switches. docs/architecture/44.
 * An agent never writes to a workspace: every change it wants is a proposal (docs/architecture/43).
 */
import { sql } from "@/lib/db"
import { CAPABILITIES } from "@/lib/actions/capabilities"
import { propose as proposeAction } from "@/lib/actions/store"
import { recordChange } from "@/lib/audit/record-change"
import { DEFINITIONS } from "./definitions"
import { EVENT_TTL_DAYS } from "./events"
import { MAX_ATTEMPTS, STALE_MS, isDue, periodKey, withinCeiling, type AgentDefinition, type ExecMode, type StepCtx } from "./model"

export interface AgentPrincipal { userId: string; orgId: string; persona: "founder" | "vc"; canWrite: boolean }
export interface Deps {
  /** Resolve who the run acts as, failing closed if they are no longer a writing member of the workspace. */
  principal: (userId: string, orgId: string) => Promise<AgentPrincipal>
  /** Throws if the workspace may not run work now (paused, offboarding). */
  allowed: (orgId: string) => Promise<void>
  now: () => Date
  /** Run `fn` inside the workspace's AI context (plan, pause, monthly allowance) with a hard per-run spend ceiling. */
  ai: <T>(who: AgentPrincipal, maxSpendUsd: number, fn: () => Promise<T>) => Promise<T>
  /** One model call, inside `ai`. Throws on failure or an empty answer. */
  generate: (prompt: string, opts?: { maxTokens?: number }) => Promise<string>
  /** Spend so far in the current `ai` context, in USD. */
  spent: () => number
}
export const defaultDeps: Deps = {
  async principal(userId, orgId) {
    const { resolveAiPrincipal } = await import("@/lib/assistant/principal")
    const p = await resolveAiPrincipal(userId, { orgId })
    if (!p.canWrite || !p.orgId || (p.persona !== "founder" && p.persona !== "vc")) throw new Error("The person who enabled this agent can no longer act for this workspace.")
    return { userId, orgId: p.orgId, persona: p.persona, canWrite: p.canWrite }
  },
  async allowed(orgId) { const { assertAllowed } = await import("@/lib/entitlements"); await assertAllowed(orgId, "ai") },
  now: () => new Date(),
  async ai(who, maxSpendUsd, fn) {
    const [{ resolveAiPrincipal }, { withAiContext }] = await Promise.all([import("@/lib/assistant/principal"), import("@/lib/assistant/context")])
    const p = await resolveAiPrincipal(who.userId, { orgId: who.orgId })
    return withAiContext(p, fn, undefined, maxSpendUsd)
  },
  async generate(prompt, opts) {
    const { generateDetailed } = await import("@/lib/ai/provider")
    const r = await generateDetailed(prompt, { task: "agent_brief", maxTokens: opts?.maxTokens ?? 400, temperature: 0.2 })
    if (r.error || !r.text) throw new Error(r.error || "The model returned nothing.")
    return r.text
  },
  spent: () => { try { return require("@/lib/assistant/context").currentRunBudget()?.spendUsd ?? 0 } catch { return 0 } },
}

class Stop extends Error { constructor(readonly status: "killed" | "budget_stopped", message: string) { super(message) } }

/** Why this run must not go on, or null. Platform flags stop even a run in flight; the workspace switch governs scheduled runs only (a person pressing Run now is the workspace deciding). */
export async function killReason(orgId: string, agentId: string, trigger: "schedule" | "manual" | "event"): Promise<string | null> {
  const flags = (await sql`SELECT key FROM platform_flags WHERE enabled = true AND key IN ('agents_disabled', ${"agents_disabled_" + agentId})`) as any[]
  if (flags.some((f) => f.key === "agents_disabled")) return "Agents are switched off platform-wide."
  if (flags.length) return "This agent is switched off by the platform."
  if (trigger !== "manual") {
    const [s] = (await sql`SELECT enabled FROM agent_settings WHERE org_id = ${orgId} AND agent_id = ${agentId}`) as any[]
    if (!s?.enabled) return "This agent was switched off for the workspace."
  }
  return null
}

export async function getSettings(orgId: string) {
  const rows = (await sql`SELECT agent_id, enabled, config, enabled_by FROM agent_settings WHERE org_id = ${orgId}`) as any[]
  return Object.fromEntries(rows.map((r) => [r.agent_id, r]))
}
export async function setEnabled(orgId: string, agentId: string, enabled: boolean, by: { userId: string; email?: string | null }, config?: Record<string, unknown>) {
  const def = DEFINITIONS[agentId]
  if (!def) throw new Error("Unknown agent.")
  await sql`INSERT INTO agent_settings (org_id, agent_id, enabled, config, enabled_by, updated_at)
    VALUES (${orgId}, ${agentId}, ${enabled}, ${JSON.stringify(config ?? {})}::jsonb, ${by.userId}, now())
    ON CONFLICT (org_id, agent_id) DO UPDATE SET enabled = EXCLUDED.enabled, enabled_by = EXCLUDED.enabled_by, updated_at = now()`
  if (config) await sql`UPDATE agent_settings SET config = ${JSON.stringify(config)}::jsonb WHERE org_id = ${orgId} AND agent_id = ${agentId}`
  await recordChange({ actor: by, scope: { type: "org", id: orgId }, action: `agent.${enabled ? "enabled" : "disabled"}`, target: { type: "agent", id: agentId, label: def.title }, before: null, after: { enabled } })
}

export async function createExecution(orgId: string, agentId: string, o: { trigger: "schedule" | "manual" | "event"; mode: ExecMode; requestedBy: string; now?: Date; eventId?: string }): Promise<string | null> {
  const def = DEFINITIONS[agentId]
  if (!def) throw new Error("Unknown agent.")
  if (o.trigger === "schedule" && !def.schedule) throw new Error("This agent has no schedule.")
  const key = o.trigger === "schedule" ? periodKey(def.schedule!, o.now ?? new Date()) : o.trigger === "event" ? `event:${o.eventId}` : null
  const plan = def.steps.map((s) => ({ id: s.id, label: s.label }))
  const [row] = (await sql`INSERT INTO agent_executions (org_id, agent_id, agent_version, trigger, mode, period_key, requested_by, plan)
    VALUES (${orgId}, ${agentId}, ${def.version}, ${o.trigger}, ${o.mode}, ${key}, ${o.requestedBy}, ${JSON.stringify(plan)}::jsonb)
    ON CONFLICT (org_id, agent_id, period_key) WHERE trigger IN ('schedule','event') DO NOTHING RETURNING id`) as any[]
  return row?.id ?? null
}

const finish = async (id: string, status: string, fields: { output?: unknown; error?: string | null; spend?: number } = {}) =>
  (await sql`UPDATE agent_executions SET spend_usd = spend_usd + ${fields.spend ?? 0}, status = ${status}, output = ${fields.output === undefined ? null : JSON.stringify(fields.output)}::jsonb, error = ${fields.error ?? null}, finished_at = now(), heartbeat_at = now() WHERE id = ${id} RETURNING *`)[0]

/** Run (or resume) one execution. Safe to call twice: only the caller that claims it proceeds. */
export async function runExecution(id: string, deps: Deps = defaultDeps, opts: { deadlineAt?: number } = {}) {
  const [claimed] = (await sql`UPDATE agent_executions SET status = 'running', attempts = attempts + 1, heartbeat_at = now(), started_at = COALESCE(started_at, now())
    WHERE id = ${id} AND (status = 'queued' OR (status = 'running' AND heartbeat_at < now() - ${STALE_MS / 1000} * interval '1 second')) RETURNING *`) as any[]
  if (!claimed) return null
  const def: AgentDefinition | undefined = DEFINITIONS[claimed.agent_id]
  if (!def) return finish(id, "failed", { error: "This agent no longer exists." })
  if (claimed.attempts > MAX_ATTEMPTS) return finish(id, "failed", { error: `Gave up after ${MAX_ATTEMPTS} attempts: ${claimed.error ?? "unknown error"}` })
  const state: Record<string, any> = { ...(claimed.state ?? {}) }
  try {
    const dry = claimed.mode === "dry_run"
    const [setting] = (await sql`SELECT config, enabled_by FROM agent_settings WHERE org_id = ${claimed.org_id} AND agent_id = ${claimed.agent_id}`) as any[]
    const actor = claimed.trigger !== "manual" ? setting?.enabled_by : claimed.requested_by
    if (!actor) throw new Stop("killed", "No one is recorded as having enabled this agent.")
    await deps.allowed(claimed.org_id).catch((e) => { throw new Stop("killed", String(e?.message ?? e)) })
    const who = await deps.principal(actor, claimed.org_id).catch((e) => { throw new Stop("killed", String(e?.message ?? e)) })
    const config = { ...def.defaults, ...(setting?.config ?? {}) }
    let event: StepCtx["event"] = null
    if (claimed.trigger === "event") {
      const [ev] = (await sql`SELECT id, kind, subject_id, payload FROM agent_events WHERE id = ${String(claimed.period_key).slice(6)} AND org_id = ${claimed.org_id}`) as any[]
      if (!ev) throw new Stop("killed", "The event that started this run no longer exists.")
      event = { id: ev.id, kind: ev.kind, subjectId: ev.subject_id, payload: ev.payload ?? {} }
    }
    const useModel = !!def.usesModel && config.useModel === true
    const ctx: StepCtx = {
      event, now: deps.now,
      generate: async (prompt, o) => {
        if (!useModel) throw new Error("The model is not enabled for this agent in this workspace.")
        if (def.maxSpendUsd > 0 && deps.spent() >= def.maxSpendUsd) throw new Stop("budget_stopped", `Over the $${def.maxSpendUsd.toFixed(2)} ceiling for this run.`)
        return deps.generate(prompt, o)
      },
      orgId: who.orgId, userId: who.userId, persona: who.persona, executionId: id, mode: claimed.mode, config, prev: state,
      rows: (q, p = []) => sql.unsafe(q, [who.orgId, ...p]) as Promise<any[]>,
      async propose(capability, input) {
        const cap = CAPABILITIES[capability]
        if (!cap) throw new Error(`Unknown capability ${capability}.`)
        if (!withinCeiling(cap.risk, def.riskCeiling)) throw new Stop("killed", `${def.title} may not propose ${capability} (${cap.risk} is above its ${def.riskCeiling} ceiling).`)
        const scope = { orgId: who.orgId, userId: who.userId, persona: who.persona }
        if (dry) { const plan = await cap.plan(scope, cap.check(input)); return { summary: plan.summary, created: false } }
        const r = await proposeAction(scope, capability, input, { runId: id, trust: "trusted", agentId: def.id, executionId: id }, { userId: who.userId })
        return { summary: r.proposal.summary, created: !r.existing }
      },
    }
    const loop = async (): Promise<"queued" | null> => {
      for (const step of def.steps) {
        if (Object.hasOwn(state, step.id)) continue // finished before a crash: its output is reloaded, not recomputed
        const why = await killReason(claimed.org_id, def.id, claimed.trigger)
        if (why) throw new Stop("killed", why)
        if (opts.deadlineAt && deps.now().getTime() > opts.deadlineAt) { // out of time: hand back to the dispatcher to resume
          await sql`UPDATE agent_executions SET status = 'queued', state = ${JSON.stringify(state)}::jsonb WHERE id = ${id}`; return "queued"
        }
        state[step.id] = await step.run(ctx)
        await sql`UPDATE agent_executions SET state = ${JSON.stringify(state)}::jsonb, heartbeat_at = now() WHERE id = ${id}`
      }

      return null
    }
    // A model-using agent runs inside the workspace's AI context (plan, pause, allowance) with a hard spend ceiling; any other agent runs plain.
    let spend = 0
    const handed = useModel ? await deps.ai(who, def.maxSpendUsd, async () => { const r = await loop(); spend = deps.spent(); return r }) : await loop()
    if (handed === "queued") return (await sql`SELECT * FROM agent_executions WHERE id = ${id}`)[0]
    const output = def.finish(state)
    return await finish(id, "succeeded", { output, spend })
  } catch (e: any) {
    if (e instanceof Stop) return finish(id, e.status, { error: e.message })
    if (e?.name === "AiBudgetExceeded") return finish(id, "budget_stopped", { error: String(e.message).slice(0, 300) })
    const message = String(e?.message ?? e).slice(0, 300)
    // A failed step is retried (its finished steps are kept) until the attempts run out.
    if (claimed.attempts >= MAX_ATTEMPTS) return finish(id, "failed", { error: message })
    return (await sql`UPDATE agent_executions SET status = 'queued', error = ${message}, state = ${JSON.stringify(state)}::jsonb WHERE id = ${id} RETURNING *`)[0]
  }
}

/** The cron: start every scheduled run that is due, then resume anything queued or stale. */
export async function dispatch(deps: Deps = defaultDeps, opts: { max?: number; deadlineAt?: number } = {}) {
  const now = deps.now(), max = opts.max ?? 20
  // Housekeeping: a proposal nobody decided within its two weeks is closed, so nothing waits forever on a person who never looks.
  await sql`UPDATE action_proposals SET status = 'expired' WHERE status = 'pending' AND expires_at < now()`
  const started: string[] = [], resumed: string[] = []
  const enabled = (await sql`SELECT org_id, agent_id, enabled_by FROM agent_settings WHERE enabled = true`) as any[]
  for (const s of enabled) {
    if (started.length >= max) break
    const def = DEFINITIONS[s.agent_id]
    if (!def?.schedule || !isDue(def.schedule, now)) continue
    if (await killReason(s.org_id, s.agent_id, "schedule")) continue
    const id = await createExecution(s.org_id, s.agent_id, { trigger: "schedule", mode: "live", requestedBy: s.enabled_by ?? "", now })
    if (id) started.push(id)
  }
  // Events: each starts at most one run per listening agent (the event id is the period key), and one older than its time to live is dropped unread.
  const events = (await sql`SELECT id, org_id, kind, (created_at < now() - ${EVENT_TTL_DAYS} * interval '1 day') AS expired FROM agent_events WHERE processed_at IS NULL ORDER BY created_at LIMIT 200`) as any[]
  for (const ev of events) {
    if (!ev.expired) {
      for (const def of Object.values(DEFINITIONS).filter((d) => d.triggers?.some((t) => t.event === ev.kind))) {
        const [s] = (await sql`SELECT enabled_by FROM agent_settings WHERE org_id = ${ev.org_id} AND agent_id = ${def.id} AND enabled = true`) as any[]
        if (!s || await killReason(ev.org_id, def.id, "event")) continue
        const id = await createExecution(ev.org_id, def.id, { trigger: "event", mode: "live", requestedBy: s.enabled_by ?? "", eventId: ev.id })
        if (id) started.push(id)
      }
    }
    await sql`UPDATE agent_events SET processed_at = now() WHERE id = ${ev.id}`
  }
  const open = (await sql`SELECT id FROM agent_executions WHERE status = 'queued' OR (status = 'running' AND heartbeat_at < now() - ${STALE_MS / 1000} * interval '1 second') ORDER BY created_at LIMIT ${max}`) as any[]
  for (const r of open) { const done = await runExecution(r.id, deps, opts); if (done) resumed.push(r.id) }
  return { started: started.length, ran: resumed.length }
}

export async function listExecutions(orgId: string, limit = 30) {
  return (await sql`SELECT id, agent_id, trigger, mode, status, plan, output, error, attempts, started_at, finished_at, created_at FROM agent_executions WHERE org_id = ${orgId} ORDER BY created_at DESC LIMIT ${limit}`) as any[]
}

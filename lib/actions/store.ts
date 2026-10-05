/** Proposals: make, decide, undo, list. docs/architecture/43. Every query is scoped by org_id from the caller, never from input. */
import { sql } from "@/lib/db"
import { recordChange } from "@/lib/audit/record-change"
import { CAPABILITIES, ActionError, type Scope } from "./capabilities"
import { idempotencyKey, mayAutoCommit, type RiskClass, type SourceTrust } from "./model"

export interface Proposal {
  id: string; org_id: string; capability: string; input: any; summary: string; diff: any[]; evidence: any; risk_class: RiskClass
  run_id: string | null; agent_id: string | null; source_trust: SourceTrust; status: string; requested_by: string; decided_by: string | null
  decided_at: string | null; applied_at: string | null; undone_at: string | null; failure: string | null; auto_committed: boolean; created_at: string; expires_at: string
}
export interface Actor { userId: string; email?: string | null }

const audit = (orgId: string, actor: { userId: string | null; email?: string | null }, action: string, p: { id: string; summary: string }, context: Record<string, unknown> = {}) =>
  recordChange({ actor, scope: { type: "org", id: orgId }, action: `action_proposal.${action}`, target: { type: "action_proposal", id: p.id, label: p.summary }, before: null, after: { summary: p.summary }, context })

export async function getAutonomy(orgId: string): Promise<Partial<Record<RiskClass, boolean>>> {
  const rows = (await sql`SELECT risk_class, auto_commit FROM workspace_autonomy WHERE org_id = ${orgId}`) as any[]
  return Object.fromEntries(rows.map((r) => [r.risk_class, !!r.auto_commit]))
}
export async function setAutonomy(orgId: string, risk: RiskClass, on: boolean, by: Actor) {
  // R1 to R3 are never loosened: the switch exists for R0 only, and mayAutoCommit enforces it again at decision time.
  if (risk !== "R0") throw new ActionError("Only low-risk (R0) changes can be applied automatically.")
  await sql`INSERT INTO workspace_autonomy (org_id, risk_class, auto_commit, set_by, set_at) VALUES (${orgId}, ${risk}, ${on}, ${by.userId}, now())
    ON CONFLICT (org_id, risk_class) DO UPDATE SET auto_commit = EXCLUDED.auto_commit, set_by = EXCLUDED.set_by, set_at = now()`
  await recordChange({ actor: by, scope: { type: "org", id: orgId }, action: "workspace_autonomy.changed", target: { type: "workspace_autonomy", id: `${orgId}:${risk}` }, before: null, after: { risk_class: risk, auto_commit: on } })
}

/** Make a proposal. Returns the proposal and, when policy allowed it, the applied result. Idempotent per run. */
export async function propose(scope: Scope & { persona?: string | null }, capability: string, rawInput: unknown, ctx: { runId: string | null; chatId?: string | null; trust: SourceTrust; agentId?: string | null; executionId?: string | null }, actor?: Actor) {
  const cap = CAPABILITIES[capability]
  if (!cap) throw new ActionError("Unknown capability.")
  const input = cap.check(rawInput)
  const key = idempotencyKey(ctx.runId, capability, input)
  const existing = (await sql`SELECT * FROM action_proposals WHERE org_id = ${scope.orgId} AND idempotency_key = ${key}`) as any[]
  if (existing[0]) return { proposal: existing[0] as Proposal, applied: existing[0].status === "applied", message: null as string | null, existing: true }
  const plan = await cap.plan(scope, input)
  const [row] = (await sql`INSERT INTO action_proposals (org_id, persona, requested_by, capability, input, summary, diff, evidence, risk_class, run_id, chat_id, source_trust, idempotency_key, agent_id, execution_id)
    VALUES (${scope.orgId}, ${scope.persona ?? null}, ${scope.userId}, ${capability}, ${JSON.stringify(input)}::jsonb, ${plan.summary}, ${JSON.stringify(plan.diff)}::jsonb, ${JSON.stringify(plan.evidence)}::jsonb,
            ${cap.risk}, ${ctx.runId}, ${ctx.chatId ?? null}, ${ctx.trust}, ${key}, ${ctx.agentId ?? null}, ${ctx.executionId ?? null})
    ON CONFLICT (org_id, idempotency_key) DO NOTHING RETURNING *`) as any[]
  if (!row) { const [again] = (await sql`SELECT * FROM action_proposals WHERE org_id = ${scope.orgId} AND idempotency_key = ${key}`) as any[]; return { proposal: again as Proposal, applied: again.status === "applied", message: null, existing: true } }
  await audit(scope.orgId, actor ?? { userId: scope.userId }, "created", row, { capability, risk_class: cap.risk, source_trust: ctx.trust, run_id: ctx.runId })
  if (mayAutoCommit(cap.risk, ctx.trust, await getAutonomy(scope.orgId))) {
    const r = await decide(scope.orgId, row.id, "approve", { userId: scope.userId, email: actor?.email }, { auto: true })
    return { proposal: r.proposal, applied: r.proposal.status === "applied", message: r.message, existing: false }
  }
  return { proposal: row as Proposal, applied: false, message: null, existing: false }
}

/** Approve (apply once), reject or undo. A repeat of the same decision returns the stored result and changes nothing. */
export async function decide(orgId: string, id: string, decision: "approve" | "reject" | "undo", by: Actor, opts: { auto?: boolean } = {}): Promise<{ proposal: Proposal; message: string }> {
  const [cur] = (await sql`SELECT * FROM action_proposals WHERE id = ${id} AND org_id = ${orgId}`) as any[]
  if (!cur) throw new ActionError("Proposal not found.")
  const scope: Scope = { orgId, userId: cur.requested_by }
  const cap = CAPABILITIES[cur.capability]
  if (cur.status === "pending" && new Date(cur.expires_at) < new Date()) {
    await sql`UPDATE action_proposals SET status = 'expired' WHERE id = ${id} AND status = 'pending'`
    throw new ActionError("This proposal expired. Ask again to get a fresh one.")
  }
  if (decision === "reject") {
    if (cur.status === "rejected") return { proposal: cur, message: "Already rejected." }
    const [r] = (await sql`UPDATE action_proposals SET status = 'rejected', decided_by = ${by.userId}, decided_at = now() WHERE id = ${id} AND org_id = ${orgId} AND status = 'pending' RETURNING *`) as any[]
    if (!r) throw new ActionError(`This proposal is ${cur.status} and cannot be rejected.`)
    await audit(orgId, by, "rejected", r)
    return { proposal: r, message: "Rejected. Nothing was changed." }
  }
  if (decision === "approve") {
    if (cur.status === "applied") return { proposal: cur, message: "Already applied." }
    // The claim: only the caller that flips pending to applied performs the write, so a double click or a retry applies once.
    const [claimed] = (await sql`UPDATE action_proposals SET status = 'applied', decided_by = ${by.userId}, decided_at = now(), auto_committed = ${!!opts.auto}
      WHERE id = ${id} AND org_id = ${orgId} AND status = 'pending' RETURNING *`) as any[]
    if (!claimed) throw new ActionError(`This proposal is ${cur.status} and cannot be approved.`)
    try {
      const out = await cap.apply(scope, cur.input)
      const [done] = (await sql`UPDATE action_proposals SET applied_at = now(), undo = ${JSON.stringify(out.undo)}::jsonb WHERE id = ${id} RETURNING *`) as any[]
      await audit(orgId, by, opts.auto ? "auto_committed" : "applied", done, { capability: cur.capability, proposal_id: id })
      return { proposal: done, message: out.message }
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 300)
      const [failed] = (await sql`UPDATE action_proposals SET status = 'failed', failure = ${msg} WHERE id = ${id} RETURNING *`) as any[]
      await audit(orgId, by, "failed", failed, { error: msg })
      return { proposal: failed, message: `Not applied: ${msg}` }
    }
  }
  // undo
  if (cur.status === "undone") return { proposal: cur, message: "Already undone." }
  if (cur.status !== "applied" || !cur.undo) throw new ActionError("Only an applied change can be undone.")
  const [claimed] = (await sql`UPDATE action_proposals SET status = 'undone', undone_at = now() WHERE id = ${id} AND org_id = ${orgId} AND status = 'applied' RETURNING *`) as any[]
  if (!claimed) throw new ActionError("This change was already undone.")
  try {
    const message = await cap.undo(scope, cur.input, cur.undo)
    await audit(orgId, by, "undone", claimed, { proposal_id: id })
    return { proposal: claimed, message }
  } catch (e: any) {
    await sql`UPDATE action_proposals SET status = 'applied', undone_at = NULL WHERE id = ${id} AND status = 'undone'`
    throw e
  }
}

export async function listProposals(orgId: string, tab: "pending" | "history", limit = 200): Promise<Proposal[]> {
  await sql`UPDATE action_proposals SET status = 'expired' WHERE org_id = ${orgId} AND status = 'pending' AND expires_at < now()`
  const rows = tab === "pending"
    ? await sql`SELECT * FROM action_proposals WHERE org_id = ${orgId} AND status = 'pending' ORDER BY created_at DESC LIMIT ${limit}`
    : await sql`SELECT * FROM action_proposals WHERE org_id = ${orgId} AND status <> 'pending' ORDER BY COALESCE(decided_at, created_at) DESC LIMIT ${limit}`
  return rows as Proposal[]
}
export async function pendingCount(orgId: string): Promise<number> {
  const [r] = (await sql`SELECT count(*)::int AS n FROM action_proposals WHERE org_id = ${orgId} AND status = 'pending' AND expires_at > now()`) as any[]
  return r?.n ?? 0
}

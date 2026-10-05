/**
 * Capabilities the action layer can propose. docs/architecture/43 §4.
 * Each is declared once: a risk class, a bounded input check, and plan (read-only), apply (the write, returns the undo record) and undo (refuses if the world moved on).
 * Every statement is scoped by the workspace id from the caller, never from input.
 */
import { sql } from "@/lib/db"
import type { DiffLine, RiskClass } from "./model"

export interface Scope { orgId: string; userId: string }
export interface Plan { summary: string; diff: DiffLine[]; evidence: Record<string, unknown> }
export interface Capability {
  name: string
  risk: RiskClass
  /** Throws a plain message for an input that is malformed. */
  check(input: any): { [k: string]: any }
  plan(scope: Scope, input: any): Promise<Plan>
  apply(scope: Scope, input: any): Promise<{ undo: Record<string, unknown>; message: string }>
  undo(scope: Scope, input: any, undo: Record<string, any>): Promise<string>
}

export const STAGES = ["queued", "contacted", "responded", "meeting", "in_diligence", "committed", "passed"]

export class ActionError extends Error {}

const stageMove: Capability = {
  name: "crm_update_stage",
  risk: "R0",
  check(input) {
    const entryId = String(input?.entryId ?? "").trim()
    const stage = String(input?.stage ?? "")
    if (!entryId) throw new ActionError("entryId is required.")
    if (!STAGES.includes(stage)) throw new ActionError(`stage must be one of ${STAGES.join("|")}.`)
    return { entryId, stage }
  },
  async plan(scope, input) {
    const { entryId, stage } = this.check(input)
    const [row] = (await sql`SELECT id, display_name, stage FROM crm_entries WHERE id = ${entryId} AND org_id = ${scope.orgId}`) as any[]
    if (!row) throw new ActionError("Contact not found in this workspace.")
    return {
      summary: `Move ${row.display_name ?? "a contact"} from ${row.stage} to ${stage}`,
      diff: [{ label: `${row.display_name ?? entryId}: stage`, before: row.stage, after: stage }],
      evidence: { records: [{ type: "crm_entry", id: row.id, label: row.display_name }] },
    }
  },
  async apply(scope, input) {
    const { entryId, stage } = this.check(input)
    const [before] = (await sql`SELECT stage, display_name FROM crm_entries WHERE id = ${entryId} AND org_id = ${scope.orgId}`) as any[]
    if (!before) throw new ActionError("Contact no longer exists in this workspace.")
    await sql`UPDATE crm_entries SET stage = ${stage}, updated_at = now() WHERE id = ${entryId} AND org_id = ${scope.orgId}`
    return { undo: { entryId, from: before.stage, applied: stage }, message: `${before.display_name ?? "Contact"} moved to ${stage}.` }
  },
  async undo(scope, _input, u) {
    const rows = (await sql`UPDATE crm_entries SET stage = ${String(u.from)}, updated_at = now()
      WHERE id = ${String(u.entryId)} AND org_id = ${scope.orgId} AND stage = ${String(u.applied)} RETURNING display_name`) as any[]
    if (!rows.length) throw new ActionError("Not undone: this contact was moved again since, and undo will not overwrite later work.")
    return `${rows[0].display_name ?? "Contact"} is back in ${u.from}.`
  },
}

const addTask: Capability = {
  name: "crm_add_task",
  risk: "R0",
  check(input) {
    const title = String(input?.title ?? "").trim().slice(0, 300)
    if (!title) throw new ActionError("title is required.")
    let dueAt: string | null = null
    if (input?.dueAt) {
      const d = new Date(String(input.dueAt))
      if (Number.isNaN(d.getTime())) throw new ActionError("dueAt is not a valid date.")
      dueAt = d.toISOString()
    }
    return { title, dueAt, entryId: input?.entryId ? String(input.entryId) : null }
  },
  async plan(scope, input) {
    const { title, dueAt, entryId } = this.check(input)
    let label: string | null = null
    if (entryId) {
      const [e] = (await sql`SELECT display_name FROM crm_entries WHERE id = ${entryId} AND org_id = ${scope.orgId}`) as any[]
      if (!e) throw new ActionError("Contact not found in this workspace.")
      label = e.display_name ?? null
    }
    return {
      summary: `Add task "${title}"${label ? ` for ${label}` : ""}${dueAt ? `, due ${dueAt.slice(0, 10)}` : ""}`,
      diff: [{ label: "New task", before: null, after: `${title}${dueAt ? ` (due ${dueAt.slice(0, 10)})` : ""}${label ? ` · ${label}` : ""}` }],
      evidence: entryId ? { records: [{ type: "crm_entry", id: entryId, label }] } : {},
    }
  },
  async apply(scope, input) {
    const { title, dueAt, entryId } = this.check(input)
    if (entryId) {
      const [e] = (await sql`SELECT id FROM crm_entries WHERE id = ${entryId} AND org_id = ${scope.orgId}`) as any[]
      if (!e) throw new ActionError("Contact no longer exists in this workspace.")
    }
    const [t] = (await sql`INSERT INTO crm_tasks (org_id, user_id, crm_entry_id, title, due_at) VALUES (${scope.orgId}, ${scope.userId}, ${entryId}, ${title}, ${dueAt}) RETURNING id`) as any[]
    return { undo: { taskId: String(t.id) }, message: `Task created: "${title}". It is in the CRM's Today queue.` }
  },
  async undo(scope, _input, u) {
    const rows = (await sql`DELETE FROM crm_tasks WHERE id::text = ${String(u.taskId)} AND org_id = ${scope.orgId} AND done_at IS NULL RETURNING title`) as any[]
    if (!rows.length) throw new ActionError("Not undone: the task was already completed or removed.")
    return `Task "${rows[0].title}" removed.`
  },
}

export const CAPABILITIES: Record<string, Capability> = { crm_update_stage: stageMove, crm_add_task: addTask }
export const isProposeCapability = (name: string) => Object.hasOwn(CAPABILITIES, name)

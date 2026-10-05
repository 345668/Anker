/**
 * Capabilities the action layer can propose. docs/architecture/43 §4.
 * Each is declared once: a risk class, a bounded input check, and plan (read-only), apply (the write, returns the undo record) and undo (refuses if the world moved on).
 * Every statement is scoped by the workspace id from the caller, never from input.
 */
import { sql } from "@/lib/db"
import type { DiffLine, RiskClass } from "./model"
import { emit } from "@/lib/agents/runtime/events"

export interface Scope { orgId: string; userId: string }
export interface Plan { summary: string; diff: DiffLine[]; evidence: Record<string, unknown> }
export interface Capability {
  name: string
  risk: RiskClass
  /** Throws a plain message for an input that is malformed. */
  check(input: any): { [k: string]: any }
  plan(scope: Scope, input: any): Promise<Plan>
  /** `meta.agentId` is set when an agent made the proposal, so memory can record who wrote it. */
  apply(scope: Scope, input: any, meta?: { agentId?: string | null }): Promise<{ undo: Record<string, unknown>; message: string }>
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
    if (before.stage !== stage) await emit(scope.orgId, "crm.stage_changed", entryId, { from: before.stage, to: stage })
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

import { KEY_RE, MAX_VALUE } from "@/lib/memory/store"

const remember: Capability = {
  name: "memory_remember",
  risk: "R0",
  check(input) {
    const entityId = String(input?.entityId ?? "").trim(), key = String(input?.key ?? "").trim(), value = String(input?.value ?? "").trim()
    if (!entityId) throw new ActionError("entityId is required.")
    if (!KEY_RE.test(key)) throw new ActionError("key is lowercase letters, numbers and underscores.")
    if (!value || value.length > MAX_VALUE) throw new ActionError(`value is required and at most ${MAX_VALUE} characters.`)
    let validUntil: string | null = null
    if (input?.validUntil) { const d = new Date(String(input.validUntil)); if (Number.isNaN(d.getTime())) throw new ActionError("validUntil is not a valid date."); validUntil = d.toISOString() }
    return { entityId, key, value, validUntil }
  },
  async plan(scope, input) {
    const { entityId, key, value, validUntil } = this.check(input)
    const [e] = (await sql`SELECT display_name FROM crm_entries WHERE id = ${entityId} AND org_id = ${scope.orgId}`) as any[]
    if (!e) throw new ActionError("Contact not found in this workspace.")
    const [cur] = (await sql`SELECT value, pinned FROM entity_memory WHERE org_id = ${scope.orgId} AND entity_type = 'crm_entry' AND entity_id = ${entityId} AND key = ${key} AND (valid_until IS NULL OR valid_until > now())`) as any[]
    return {
      summary: `Remember about ${e.display_name ?? "a contact"}: ${key} = ${value}${validUntil ? ` (until ${validUntil.slice(0, 10)})` : ""}`,
      diff: [{ label: `${e.display_name ?? entityId}: ${key}`, before: cur?.value ?? null, after: value }],
      evidence: { records: [{ type: "crm_entry", id: entityId, label: e.display_name }] },
    }
  },
  async apply(scope, input, meta) {
    const { entityId, key, value, validUntil } = this.check(input)
    const [e] = (await sql`SELECT id FROM crm_entries WHERE id = ${entityId} AND org_id = ${scope.orgId}`) as any[]
    if (!e) throw new ActionError("Contact no longer exists in this workspace.")
    const [prev] = (await sql`SELECT * FROM entity_memory WHERE org_id = ${scope.orgId} AND entity_type = 'crm_entry' AND entity_id = ${entityId} AND key = ${key}`) as any[]
    // A person's entry is never replaced by a machine's; an expired one may be.
    if (prev?.pinned && meta?.agentId && (!prev.valid_until || new Date(prev.valid_until) > new Date())) throw new ActionError("Not remembered: a person set this and an agent may not replace it.")
    const source = meta?.agentId ? "agent" : "assistant"
    await sql`INSERT INTO entity_memory (org_id, entity_type, entity_id, key, value, source, pinned, valid_until, created_by)
      VALUES (${scope.orgId}, 'crm_entry', ${entityId}, ${key}, ${value}, ${source}, false, ${validUntil}, ${scope.userId})
      ON CONFLICT (org_id, entity_type, entity_id, key) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source, pinned = false, valid_until = EXCLUDED.valid_until, created_by = EXCLUDED.created_by, updated_at = now()`
    return { undo: { entityId, key, prev: prev ? { value: prev.value, source: prev.source, pinned: prev.pinned, valid_until: prev.valid_until } : null, applied: value }, message: `Remembered ${key}.` }
  },
  async undo(scope, _input, u) {
    const [cur] = (await sql`SELECT value FROM entity_memory WHERE org_id = ${scope.orgId} AND entity_type = 'crm_entry' AND entity_id = ${String(u.entityId)} AND key = ${String(u.key)}`) as any[]
    if (!cur || cur.value !== u.applied) throw new ActionError("Not undone: this memory was changed since, and undo will not overwrite later work.")
    if (u.prev) await sql`UPDATE entity_memory SET value = ${u.prev.value}, source = ${u.prev.source}, pinned = ${!!u.prev.pinned}, valid_until = ${u.prev.valid_until ?? null}, updated_at = now() WHERE org_id = ${scope.orgId} AND entity_type = 'crm_entry' AND entity_id = ${String(u.entityId)} AND key = ${String(u.key)}`
    else await sql`DELETE FROM entity_memory WHERE org_id = ${scope.orgId} AND entity_type = 'crm_entry' AND entity_id = ${String(u.entityId)} AND key = ${String(u.key)}`
    return `Forgot ${u.key}.`
  },
}

const KINDS = [{ kind: "email_intro", channel: "email", step: 0 }, { kind: "dm_intro", channel: "linkedin", step: 0 }] as const

/**
 * Save an intro email and LinkedIn message as DRAFTS for one contact. R1: it is bulk work a person should look at, and what it saves is what they would later send.
 * Saving a draft never sends: sending stays behind the campaign engine's own approval, suppression, country and sender-cap gates. The drafts travel in the proposal, so
 * what the person approves is exactly what is saved. Nothing already sent is touched, and undo removes a draft only if nobody has edited it since.
 */
const saveDrafts: Capability = {
  name: "outreach_save_drafts",
  risk: "R1",
  check(input) {
    const entryId = String(input?.entryId ?? "").trim(), subject = String(input?.subject ?? "").trim(), email = String(input?.email ?? "").trim(), dm = String(input?.dm ?? "").trim()
    if (!entryId) throw new ActionError("entryId is required.")
    if (!subject || subject.length > 200) throw new ActionError("subject is required and at most 200 characters.")
    if (email.length < 40 || email.length > 3000) throw new ActionError("email must be 40 to 3000 characters.")
    if (!dm || dm.length > 600) throw new ActionError("dm is required and at most 600 characters.")
    return { entryId, subject, email, dm, senderProfileId: input?.senderProfileId ? String(input.senderProfileId) : null }
  },
  async plan(scope, input) {
    const { entryId, subject, email, dm } = this.check(input)
    const [e] = (await sql`SELECT display_name FROM crm_entries WHERE id = ${entryId} AND org_id = ${scope.orgId}`) as any[]
    if (!e) throw new ActionError("Contact not found in this workspace.")
    const prev = (await sql`SELECT kind, body FROM outreach_messages WHERE user_id = ${scope.userId} AND crm_entry_id = ${entryId} AND kind IN ('email_intro','dm_intro') AND call_id IS NULL`) as any[]
    const was = (k: string) => prev.find((r) => r.kind === k)?.body ?? null
    const clip = (t: string, n = 220) => (t.length > n ? t.slice(0, n) + "…" : t)
    return {
      summary: `Save an intro email and LinkedIn message as drafts for ${e.display_name ?? "a contact"}`,
      diff: [
        { label: `${e.display_name ?? entryId}: email (${subject})`, before: was("email_intro") ? clip(was("email_intro")) : null, after: clip(email) },
        { label: `${e.display_name ?? entryId}: LinkedIn message`, before: was("dm_intro") ? clip(was("dm_intro")) : null, after: clip(dm) },
      ],
      evidence: { records: [{ type: "crm_entry", id: entryId, label: e.display_name }], note: "Saved as drafts only. Nothing is sent." },
    }
  },
  async apply(scope, input, meta) {
    const { entryId, subject, email, dm, senderProfileId } = this.check(input)
    const [e] = (await sql`SELECT display_email FROM crm_entries WHERE id = ${entryId} AND org_id = ${scope.orgId}`) as any[]
    if (!e) throw new ActionError("Contact no longer exists in this workspace.")
    const prev = (await sql`SELECT kind, body, subject, status FROM outreach_messages WHERE user_id = ${scope.userId} AND crm_entry_id = ${entryId} AND kind IN ('email_intro','dm_intro') AND call_id IS NULL`) as any[]
    // A message that has already gone out is never overwritten, even by an approved draft.
    const gone = prev.filter((r) => ["sent", "delivered", "replied", "accepted"].includes(r.status)).map((r) => r.kind)
    const by = meta?.agentId ? `agent:${meta.agentId}` : "assistant"
    const note = senderProfileId ? `sender:${senderProfileId}` : null
    const saved: string[] = []
    if (!gone.includes("email_intro")) {
      await sql`INSERT INTO outreach_messages (user_id, crm_entry_id, kind, step_number, channel, body, subject, email_to, status, generated_by, model_notes, created_at, updated_at)
        VALUES (${scope.userId}, ${entryId}, 'email_intro', 0, 'email', ${email}, ${subject}, ${e.display_email ?? null}, 'draft', ${by}, ${note}, NOW(), NOW())
        ON CONFLICT (user_id, crm_entry_id, kind) WHERE call_id IS NULL DO UPDATE SET body = EXCLUDED.body, subject = EXCLUDED.subject, email_to = EXCLUDED.email_to, status = 'draft', generated_by = EXCLUDED.generated_by, model_notes = EXCLUDED.model_notes, updated_at = NOW()`
      saved.push("email_intro")
    }
    if (!gone.includes("dm_intro")) {
      await sql`INSERT INTO outreach_messages (user_id, crm_entry_id, kind, step_number, channel, body, status, generated_by, created_at, updated_at)
        VALUES (${scope.userId}, ${entryId}, 'dm_intro', 0, 'linkedin', ${dm}, 'draft', ${by}, NOW(), NOW())
        ON CONFLICT (user_id, crm_entry_id, kind) WHERE call_id IS NULL DO UPDATE SET body = EXCLUDED.body, status = 'draft', generated_by = EXCLUDED.generated_by, updated_at = NOW()`
      saved.push("dm_intro")
    }
    if (!saved.length) throw new ActionError("Not saved: both messages have already been sent for this contact.")
    return { undo: { entryId, saved, email, dm, prev: prev.map((r) => ({ kind: r.kind, body: r.body, subject: r.subject })) }, message: `Saved ${saved.length === 2 ? "an email and a LinkedIn message" : "a draft"} for review in Outreach. Nothing was sent.` }
  },
  async undo(scope, _input, u) {
    const was = (k: string) => (u.prev as any[]).find((r) => r.kind === k)
    let undone = 0
    for (const k of u.saved as string[]) {
      const applied = k === "email_intro" ? u.email : u.dm
      const before = was(k)
      // Only if nobody has edited or sent it since: undo never overwrites later work.
      const rows = before
        ? (await sql`UPDATE outreach_messages SET body = ${before.body}, subject = ${before.subject ?? null}, updated_at = NOW() WHERE user_id = ${scope.userId} AND crm_entry_id = ${String(u.entryId)} AND kind = ${k} AND call_id IS NULL AND status = 'draft' AND body = ${applied} RETURNING id`) as any[]
        : (await sql`DELETE FROM outreach_messages WHERE user_id = ${scope.userId} AND crm_entry_id = ${String(u.entryId)} AND kind = ${k} AND call_id IS NULL AND status = 'draft' AND body = ${applied} RETURNING id`) as any[]
      undone += rows.length
    }
    if (!undone) throw new ActionError("Not undone: the drafts were edited or sent since, and undo will not overwrite later work.")
    return `Removed the saved draft${undone === 1 ? "" : "s"}.`
  },
}

export const CAPABILITIES: Record<string, Capability> = { crm_update_stage: stageMove, crm_add_task: addTask, memory_remember: remember, outreach_save_drafts: saveDrafts }
export const isProposeCapability = (name: string) => Object.hasOwn(CAPABILITIES, name)

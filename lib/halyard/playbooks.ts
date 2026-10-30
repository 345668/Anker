import "server-only"
import fs from "node:fs"
import path from "node:path"
import { sql } from "@/lib/db"
import { encryptSecret, decryptSecret } from "@/lib/db/secrets"
import { skillFromText, parseSkillMarkdown, loadSkillFiles, SECTION_ACTIONS, type SkillRecord } from "./core"
import { HalyardError } from "./sessions"

/**
 * Custom playbooks (docs/architecture/77, H8a): a call mode a person or workspace writes in the same file format as the shipped ones, checked by the same parser and validator.
 * The mode stored on a session is `pb-<slug>`; it is looked up per request, so deleting a playbook never breaks a session (it falls back to the general mode).
 */
export const MODE_PREFIX = "pb-"
export const MAX_FILE_CHARS = 24_000, MAX_WORKSPACE = 20, MAX_PERSONAL = 10, MAX_SLUG = 40
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface Playbook { id: string; scope: "personal" | "workspace"; slug: string; mode: string; label: string; authorId: string; updatedAt: string; updatedBy: string | null }
export interface Preview { ok: boolean; errors: string[]; slug: string | null; label: string | null; description: string | null; sections: string[]; chars: number; hasNotesGuide: boolean; hasEmailGuide: boolean }

let shipped: SkillRecord[] | null = null
export function shippedSkills(): SkillRecord[] {
  if (!shipped) shipped = loadSkillFiles([{ dir: path.join(process.cwd(), "skills", "halyard"), source: "app" }]).skills
  return shipped
}
/** Shipped modes' raw text, for "start from a copy". Only a shipped id is ever read (never a path from the caller). */
export function shippedText(id: string): string | null {
  const s = shippedSkills().find((x) => x.id === id && x.base === "call")
  if (!s) return null
  try { return fs.readFileSync(s.path, "utf8") } catch { return null }
}

/** Checks a file without saving it, and tells the author what the parser understood. */
export function previewPlaybook(text: unknown): Preview {
  const src = typeof text === "string" ? text : ""
  const out: Preview = { ok: false, errors: [], slug: null, label: null, description: null, sections: [], chars: src.length, hasNotesGuide: false, hasEmailGuide: false }
  if (!src.trim()) { out.errors.push("The playbook is empty."); return out }
  if (src.length > MAX_FILE_CHARS) { out.errors.push(`The playbook is longer than ${MAX_FILE_CHARS.toLocaleString("en")} characters.`); return out }
  const { meta } = parseSkillMarkdown(src)
  const rec = skillFromText(src, "playbook", "Playbook")
  const name = typeof meta?.name === "string" ? meta.name : null
  if ("error" in rec) out.errors.push(...rec.error.replace(/^Playbook:\s*/, "").split("; ").filter(Boolean))
  if (name) {
    out.slug = name
    if (name.length > MAX_SLUG) out.errors.push(`name must be at most ${MAX_SLUG} characters`)
    if (name !== "general" && shippedSkills().some((s) => s.id === name || s.name === name)) out.errors.push(`name "${name}" is already a built-in mode; choose another`)
  }
  if (meta?.halyard?.base === "interview") out.errors.push("halyard.base must be call: interview coaching is a desktop-only mode")
  if (meta?.halyard?.replaces) out.errors.push("halyard.replaces is for built-in modes and cannot be used here")
  if (!("error" in rec)) {
    out.label = rec.mode || rec.title; out.description = rec.description
    out.sections = [...new Set(rec.sections.flatMap((x) => x.actions))].filter((a) => SECTION_ACTIONS.includes(a))
    out.hasNotesGuide = rec.sections.some((x) => x.actions.includes("notes")); out.hasEmailGuide = rec.sections.some((x) => x.actions.includes("email"))
  }
  out.errors = [...new Set(out.errors)]; out.ok = out.errors.length === 0
  return out
}

const row = (r: any): Playbook => ({ id: r.id, scope: r.scope, slug: r.slug, mode: MODE_PREFIX + r.slug, label: r.label, authorId: r.user_id, updatedAt: r.updated_at, updatedBy: r.updated_by })
const canEditWorkspace = (role: string) => ["workspace_owner", "admin"].includes(role)

/** What a person can pick: workspace playbooks, and their own. */
export async function listPlaybooks(orgId: string, userId: string): Promise<Playbook[]> {
  const rows = (await sql`SELECT id, scope, user_id, slug, label, updated_at, updated_by FROM halyard_playbooks WHERE org_id = ${orgId} AND (scope = 'workspace' OR user_id = ${userId}) ORDER BY scope DESC, label`) as any[]
  return rows.map(row)
}
export async function getPlaybookText(orgId: string, userId: string, id: string): Promise<{ playbook: Playbook; text: string }> {
  const [r] = (await sql`SELECT * FROM halyard_playbooks WHERE id = ${id} AND org_id = ${orgId} AND (scope = 'workspace' OR user_id = ${userId})`) as any[]
  if (!r) throw new HalyardError("That playbook was not found.", 404, "not_found")
  return { playbook: row(r), text: decryptSecret(r.markdown_enc) ?? "" }
}

export interface WriteInput { scope: unknown; text: unknown }
export async function createPlaybook(who: { orgId: string; userId: string; role: string }, i: WriteInput): Promise<Playbook> {
  const scope = i.scope === "workspace" ? "workspace" : "personal"
  if (scope === "workspace" && !canEditWorkspace(who.role)) throw new HalyardError("Only a workspace owner or admin can write a playbook for the whole workspace.", 403, "role")
  if (who.role === "viewer") throw new HalyardError("A view-only member cannot write playbooks.", 403, "role")
  const p = previewPlaybook(i.text)
  if (!p.ok) throw new HalyardError(p.errors.join("; "), 400, "invalid_playbook")
  const [n] = (await sql`SELECT count(*) FILTER (WHERE scope = 'workspace')::int AS w, count(*) FILTER (WHERE scope = 'personal' AND user_id = ${who.userId})::int AS pr FROM halyard_playbooks WHERE org_id = ${who.orgId}`) as any[]
  if (scope === "workspace" && n.w >= MAX_WORKSPACE) throw new HalyardError(`A workspace can have at most ${MAX_WORKSPACE} playbooks. Delete one first.`, 409, "limit")
  if (scope === "personal" && n.pr >= MAX_PERSONAL) throw new HalyardError(`You can have at most ${MAX_PERSONAL} personal playbooks. Delete one first.`, 409, "limit")
  const [taken] = (await sql`SELECT 1 FROM halyard_playbooks WHERE org_id = ${who.orgId} AND slug = ${p.slug}`) as any[]
  if (taken) throw new HalyardError(`There is already a playbook called "${p.slug}" in this workspace. Choose another name.`, 409, "taken")
  const [r] = (await sql`INSERT INTO halyard_playbooks (org_id, scope, user_id, slug, label, markdown_enc, updated_by) VALUES (${who.orgId}, ${scope}, ${who.userId}, ${p.slug}, ${(p.label ?? p.slug!).slice(0, 80)}, ${encryptSecret(String(i.text))}, ${who.userId}) RETURNING *`) as any[]
  return row(r)
}
export async function updatePlaybook(who: { orgId: string; userId: string; role: string }, id: string, text: unknown): Promise<Playbook> {
  const { playbook } = await getPlaybookText(who.orgId, who.userId, id)
  if (playbook.scope === "workspace" ? !canEditWorkspace(who.role) : playbook.authorId !== who.userId) throw new HalyardError("You cannot change this playbook.", 403, "role")
  const p = previewPlaybook(text)
  if (!p.ok) throw new HalyardError(p.errors.join("; "), 400, "invalid_playbook")
  if (p.slug !== playbook.slug) throw new HalyardError("A playbook's name cannot change (sessions refer to it). Create a new one instead.", 409, "name_locked")
  const [r] = (await sql`UPDATE halyard_playbooks SET label = ${(p.label ?? p.slug!).slice(0, 80)}, markdown_enc = ${encryptSecret(String(text))}, updated_at = now(), updated_by = ${who.userId} WHERE id = ${id} AND org_id = ${who.orgId} RETURNING *`) as any[]
  return row(r)
}
export async function deletePlaybook(who: { orgId: string; userId: string; role: string }, id: string): Promise<void> {
  const { playbook } = await getPlaybookText(who.orgId, who.userId, id)
  if (playbook.scope === "workspace" ? !canEditWorkspace(who.role) : playbook.authorId !== who.userId) throw new HalyardError("You cannot delete this playbook.", 403, "role")
  await sql`DELETE FROM halyard_playbooks WHERE id = ${id} AND org_id = ${who.orgId}`
}

/** The playbook behind a session's mode, or null (a built-in mode, a deleted playbook, or someone else's personal one). */
export async function playbookSkill(orgId: string, userId: string, mode: string): Promise<SkillRecord | null> {
  if (!mode.startsWith(MODE_PREFIX)) return null
  const [r] = (await sql`SELECT scope, user_id, markdown_enc FROM halyard_playbooks WHERE org_id = ${orgId} AND slug = ${mode.slice(MODE_PREFIX.length)}`) as any[]
  if (!r || (r.scope === "personal" && r.user_id !== userId)) return null
  const rec = skillFromText(decryptSecret(r.markdown_enc) ?? "", "playbook", "Playbook")
  return "error" in rec || rec.base !== "call" ? null : rec
}
/** Can this person start a session in this mode? Built-in ones always; a custom one only if it exists and is theirs to use. */
export async function modeAllowed(orgId: string, userId: string, mode: string): Promise<boolean> {
  return mode.startsWith(MODE_PREFIX) ? !!(await playbookSkill(orgId, userId, mode)) : false
}

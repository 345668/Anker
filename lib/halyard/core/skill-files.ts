/**
 * Skill files: skills/halyard/<name>/SKILL.md (ported from the Halyard desktop `src/skill-files.js`; same format, same rules, proved by the differential test).
 *
 * The format follows Anthropic's Agent Skills (SKILL.md with `name` and `description` frontmatter and a Markdown body). A `halyard:` frontmatter block, which the model never sees,
 * carries base, replaces, modes, context, maxTokens, mode, order, answerLength, notesFocus and prepHint. A body heading `## Action: say` (or `## Action: say, answerThis`) starts a
 * section sent only with those actions; the rest of the body is shared. Deliberately not a general YAML parser: anything it does not understand is reported, not guessed.
 */
import fs from "node:fs"
import path from "node:path"

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const RESERVED = /anthropic|claude/
export const KNOWN_MODES = ["assist", "say", "followup", "recap", "ask", "answerThis"]
export const KNOWN_CONTEXT = ["resume", "jobDescription", "stories"]
/** Actions a body section can target: the actions, plus the Prep brief and the notetaker's two drafts. */
export const SECTION_ACTIONS = [...KNOWN_MODES, "prep", "notes", "email"]
const ACTION_HEADING = /^##\s+Action:\s*(.+?)\s*$/
const BODY_LIMIT = 20000

export interface ActionSection { actions: string[]; text: string }
export interface SkillRecord {
  id: string; name: string; title: string; description: string; body: string; shared: string; sections: ActionSection[]
  stories: string | null; notes: string | null; mode: string | null; order: number; answerLength: string | null; prepHint: string | null; notesFocus: string | null
  base: string; modes: string[]; context: string[]; maxTokens: Record<string, number>; source: string; path: string
}

/** Splits a body into the shared part and its action sections. */
export function splitActionSections(body: unknown): { shared: string; sections: ActionSection[]; errors: string[] } {
  const shared: string[] = []
  const sections: Array<{ actions: string[]; lines: string[] }> = []
  const errors: string[] = []
  let current: { actions: string[]; lines: string[] } | null = null
  for (const line of String(body || "").split("\n")) {
    const action = ACTION_HEADING.exec(line)
    if (action) {
      const actions = action[1].split(",").map((a) => a.trim()).filter(Boolean)
      for (const a of actions) if (!SECTION_ACTIONS.includes(a)) errors.push(`unknown action section "${a}"`)
      current = { actions, lines: [] }
      sections.push(current)
      continue
    }
    if (current && /^##\s/.test(line)) current = null              // any other level-2 heading ends an action section
    ;(current ? current.lines : shared).push(line)
  }
  return { shared: shared.join("\n").replace(/\n{3,}/g, "\n\n").trim(), sections: sections.map((sec) => ({ actions: sec.actions, text: sec.lines.join("\n").trim() })), errors }
}
/** The body as one action sees it: the shared part and that action's sections. */
export function bodyFor(skill: { body: string; shared?: string; sections?: ActionSection[] } | null | undefined, action: string): string {
  if (!skill || !skill.sections) return skill ? skill.body : ""
  const own = skill.sections.filter((sec) => sec.actions.includes(action) && sec.text).map((sec) => sec.text)
  return [skill.shared, ...own].filter(Boolean).join("\n\n")
}

type Scalar = string | number | boolean | Scalar[] | { [k: string]: Scalar }
function parseScalar(raw: string): Scalar {
  const v = raw.trim()
  if (v === "") return ""
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(",").map((x) => parseScalar(x)).filter((x) => x !== "")
  if (/^\{.*\}$/.test(v)) {
    const out: { [k: string]: Scalar } = {}
    for (const pair of v.slice(1, -1).split(",")) { const i = pair.indexOf(":"); if (i > 0) out[pair.slice(0, i).trim()] = parseScalar(pair.slice(i + 1)) }
    return out
  }
  if (/^(['"]).*\1$/.test(v)) return v.slice(1, -1)
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  if (v === "true" || v === "false") return v === "true"
  return v
}

/** Splits `---` frontmatter from the body and parses it. */
export function parseSkillMarkdown(text: unknown): { meta: Record<string, any> | null; body: string; errors: string[] } {
  const src = String(text || "").replace(/^﻿/, "").replace(/\r\n/g, "\n")
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(src)
  if (!m) return { meta: null, body: src.trim(), errors: ["missing --- frontmatter"] }
  const meta: Record<string, any> = {}
  const errors: string[] = []
  let parent: string | null = null
  for (const line of m[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue
    const nested = /^\s{2,}([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    const top = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (top) {
      if (top[2].trim() === "") { meta[top[1]] = {}; parent = top[1] } else { meta[top[1]] = parseScalar(top[2]); parent = null }
    } else if (nested && parent) meta[parent][nested[1]] = parseScalar(nested[2])
    else errors.push(`unreadable frontmatter line: ${line.trim()}`)
  }
  return { meta, body: m[2].trim(), errors }
}

/** The same rules Anthropic's skills use, plus Halyard's own fields. */
export function validateSkill(meta: Record<string, any> | null, body: string): string[] {
  const errors: string[] = []
  if (!meta) return ["missing frontmatter"]
  const name = meta.name
  if (typeof name !== "string" || !name) errors.push("name is required")
  else {
    if (name.length > 64) errors.push("name is longer than 64 characters")
    if (!NAME_RE.test(name)) errors.push("name must be lowercase letters, numbers and hyphens")
    if (RESERVED.test(name)) errors.push('name must not contain "anthropic" or "claude"')
  }
  const d = meta.description
  if (typeof d !== "string" || !d.trim()) errors.push("description is required")
  else if (d.length > 1024) errors.push("description is longer than 1024 characters")
  if (/<[a-z/][^>]*>/i.test(`${name || ""} ${d || ""}`)) errors.push("name and description must not contain XML tags")
  if (!body) errors.push("the body is empty")
  if (body && body.length > BODY_LIMIT) errors.push(`the body is longer than ${BODY_LIMIT} characters`)
  const h = meta.halyard || {}
  if (h.base && !["interview", "call"].includes(h.base)) errors.push('halyard.base must be "interview" or "call"')
  if (h.answerLength && !["short", "long"].includes(h.answerLength)) errors.push('halyard.answerLength must be "short" or "long"')
  if (h.notesFocus !== undefined && (typeof h.notesFocus !== "string" || h.notesFocus.length > 600)) errors.push("halyard.notesFocus must be text of at most 600 characters")
  if (h.prepHint !== undefined && (typeof h.prepHint !== "string" || h.prepHint.length > 400)) errors.push("halyard.prepHint must be text of at most 400 characters")
  errors.push(...splitActionSections(body).errors)
  if (h.order !== undefined && !Number.isFinite(h.order)) errors.push("halyard.order must be a number")
  for (const mode of ([] as any[]).concat(h.modes || [])) if (!KNOWN_MODES.includes(mode)) errors.push(`halyard.modes: unknown action "${mode}"`)
  for (const field of ([] as any[]).concat(h.context || [])) if (!KNOWN_CONTEXT.includes(field)) errors.push(`halyard.context: unknown field "${field}"`)
  return errors
}

const readIfExists = (file: string): string | null => { try { return fs.readFileSync(file, "utf8") } catch { return null } }

/** A skill record from SKILL.md text (a file, or a playbook a person wrote). Returns { error } with every problem in plain words. */
export function skillFromText(text: string, source: string, where = "SKILL.md", extra: { stories?: string | null; notes?: string | null } = {}): SkillRecord | { error: string } {
  const { meta, body, errors: parseErrors } = parseSkillMarkdown(text)
  const errors = parseErrors.concat(validateSkill(meta, body))
  if (errors.length) return { error: `${where}: ${errors.join("; ")}` }
  const h = (meta as Record<string, any>).halyard || {}
  const title = (/^#\s+(.+)$/m.exec(body) || [])[1]
  const split = splitActionSections(body)
  const m = meta as Record<string, any>
  return {
    id: h.replaces || m.name, name: m.name, title: title ? title.trim() : m.name, description: m.description.trim(), body, shared: split.shared, sections: split.sections,
    stories: extra.stories && extra.stories.trim() ? extra.stories.trim() : null, notes: extra.notes && extra.notes.trim() ? extra.notes.trim() : null,
    mode: typeof h.mode === "string" && h.mode.trim() ? h.mode.trim() : null, order: Number.isFinite(h.order) ? h.order : 100, answerLength: h.answerLength || null,
    prepHint: typeof h.prepHint === "string" && h.prepHint.trim() ? h.prepHint.trim() : null, notesFocus: typeof h.notesFocus === "string" && h.notesFocus.trim() ? h.notesFocus.trim() : null,
    base: h.base || "call", modes: h.modes ? ([] as string[]).concat(h.modes) : KNOWN_MODES.slice(), context: ([] as string[]).concat(h.context || []),
    maxTokens: h.maxTokens && typeof h.maxTokens === "object" ? h.maxTokens : {}, source, path: where,
  }
}
/** One skill directory gives a skill record, or { error }, or null when there is no SKILL.md. */
export function loadSkillDir(dir: string, source: string): SkillRecord | { error: string } | null {
  const text = readIfExists(path.join(dir, "SKILL.md"))
  if (text === null) return null
  return skillFromText(text, source, path.join(dir, "SKILL.md"), { stories: readIfExists(path.join(dir, "stories.md")), notes: readIfExists(path.join(dir, "notes.md")) })
}
/** All skills in the given roots, later roots overriding earlier ones by id. */
export function loadSkillFiles(roots: Array<{ dir: string; source: string }>): { skills: SkillRecord[]; errors: string[] } {
  const byId = new Map<string, SkillRecord>()
  const errors: string[] = []
  for (const { dir, source } of roots) {
    let entries: fs.Dirent[] = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skill = loadSkillDir(path.join(dir, entry.name), source)
      if (!skill) continue
      if ("error" in skill) { errors.push(skill.error); continue }
      byId.set(skill.id, skill)
    }
  }
  return { skills: [...byId.values()], errors }
}

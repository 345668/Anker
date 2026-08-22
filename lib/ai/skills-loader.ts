/**
 * Model skills loader — per-task **role files** that shape every LLM call.
 *
 * Each router task (lib/ai/model-router.ts) can carry a "role skill": a detailed role
 * prompt authored as `skills/models/<task>.md` (the body) plus call params
 * (temperature / maxTokens / json) declared in `skills/manifest.json`. `generate()`
 * prepends the role and fills params as defaults, so a model's role on the platform is
 * versioned and reviewable instead of buried inline.
 *
 * Format adopted from DeepSeek Harness's `SKILL.md` (MIT). See
 * docs/anker-plugins-and-model-skills.md and skills/README.md.
 *
 * Non-breaking by construction: returns inputs unchanged when the global kill-switch
 * (`ANKER_MODEL_SKILLS=off`) is set, when a call opts out (`skill:false`), or when no
 * skill exists for the task. Files are read once and cached; a missing skills/ dir
 * (e.g. a runtime that didn't ship the folder) simply disables the feature.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

export interface RoleSkill {
  task: string
  file: string
  tier: string
  model: string | null
  temperature?: number
  maxTokens?: number
  json?: boolean
  /** The markdown body (frontmatter stripped) — the role prompt. */
  body: string
}

interface ManifestEntry {
  skill: string
  tier: string
  model: string | null
  temperature?: number
  maxTokens?: number
  json?: boolean
}

const ENABLED = process.env.ANKER_MODEL_SKILLS !== "off"

let _root: string | null | undefined // undefined = unresolved, null = not found
let _manifest: Record<string, ManifestEntry> | null = null
const _cache = new Map<string, RoleSkill | null>()

/** Resolve the skills/ directory. Primary root is the project cwd (correct for the
 *  Next.js server runtime); a couple of relative fallbacks cover odd cwds. */
function skillsRoot(): string | null {
  if (_root !== undefined) return _root
  const candidates = [
    join(process.cwd(), "skills"),
    join(process.cwd(), "..", "skills"),
  ]
  for (const c of candidates) {
    try { if (existsSync(join(c, "manifest.json"))) { _root = c; return c } } catch { /* ignore */ }
  }
  _root = null
  return null
}

function manifest(): Record<string, ManifestEntry> {
  if (_manifest) return _manifest
  const root = skillsRoot()
  if (!root) return (_manifest = {})
  try {
    const raw = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"))
    _manifest = (raw?.skills ?? {}) as Record<string, ManifestEntry>
  } catch {
    _manifest = {}
  }
  return _manifest
}

/** Strip a leading YAML frontmatter block (`---\n…\n---`). Params live in the
 *  manifest (single source of truth); the body is the role prompt. */
function stripFrontmatter(md: string): string {
  if (!md.startsWith("---")) return md.trimStart()
  const close = md.indexOf("\n---", 3)
  if (close < 0) return md.trimStart()
  const bodyStart = md.indexOf("\n", close + 1)
  return bodyStart < 0 ? "" : md.slice(bodyStart + 1).trimStart()
}

/** Resolve the role skill for a task, or null if none / disabled. Cached. */
export function roleSkillFor(task: string): RoleSkill | null {
  if (!ENABLED || !task) return null
  const hit = _cache.get(task)
  if (hit !== undefined) return hit
  const root = skillsRoot()
  const entry = manifest()[task]
  if (!root || !entry) { _cache.set(task, null); return null }
  let body: string
  try {
    body = stripFrontmatter(readFileSync(join(root, entry.skill), "utf8"))
  } catch {
    _cache.set(task, null)
    return null
  }
  const skill: RoleSkill = {
    task, file: entry.skill, tier: entry.tier, model: entry.model ?? null,
    temperature: entry.temperature, maxTokens: entry.maxTokens, json: entry.json, body,
  }
  _cache.set(task, skill)
  return skill
}

type SkillableOpts = {
  task?: string
  temperature?: number
  maxTokens?: number
  json?: boolean
  model?: string
  /** Per-call opt-out. Default: apply the skill when the task has one. */
  skill?: boolean
}

/** Prepend the task's role skill to a prompt and fill call params as defaults.
 *  Caller-supplied params always win; skill params fill only the gaps. */
export function applyRoleSkill<T extends SkillableOpts>(
  prompt: string, opts: T,
): { prompt: string; opts: T; applied: RoleSkill | null } {
  if (opts.skill === false || !opts.task) return { prompt, opts, applied: null }
  const s = roleSkillFor(opts.task)
  if (!s) return { prompt, opts, applied: null }
  const next: T = {
    ...opts,
    temperature: opts.temperature ?? s.temperature,
    maxTokens: opts.maxTokens ?? s.maxTokens,
    json: opts.json ?? s.json,
    model: opts.model ?? s.model ?? undefined,
  }
  return { prompt: `${s.body}\n\n---\n\n${prompt}`, opts: next, applied: s }
}

/** Test/dev helper — drop caches after editing skills on disk. */
export function resetSkillsCache(): void {
  _root = undefined
  _manifest = null
  _cache.clear()
}

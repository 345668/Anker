import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
vi.mock("server-only", () => ({}))
import { EXCLUDED_REASONS, OBSERVE_MAX_STEPS, OBSERVE_TOOLS, isObserveTool } from "./agent-observe"

/**
 * The Observe tier's whole job is to be conservative, so these tests check the
 * property rather than the list: a tool reachable from a live call must not be
 * able to write, now or after someone edits it.
 */

const TOOL_FILES = [
  "lib/assistant/tools.ts",
  "lib/assistant/tools-fo.ts",
  "lib/assistant/tools-platform.ts",
  "lib/assistant/tools-modeling.ts",
]

/** Each tool's source, sliced from its `name:` to the next one. */
function toolSources(): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of TOOL_FILES) {
    const src = readFileSync(file, "utf8")
    const marks = [...src.matchAll(/name: "([a-z_0-9]+)"/g)].map(m => ({ name: m[1], at: m.index! }))
    marks.forEach((mark, i) => out.set(mark.name, src.slice(mark.at, marks[i + 1]?.at ?? src.length)))
  }
  return out
}

const WRITE_SQL = /\b(INSERT\s+INTO|UPDATE\s+[a-z_"]+\s+SET|DELETE\s+FROM|TRUNCATE)\b/i

describe("observe tier", () => {
  const sources = toolSources()

  it("names only tools that exist", () => {
    for (const tool of OBSERVE_TOOLS) expect(sources.has(tool), `${tool} is not a real tool`).toBe(true)
  })

  it("contains no tool that writes to the database", () => {
    // The guarantee the live-call path rests on. If someone adds a write to one
    // of these, this fails rather than the write reaching production silently.
    const writers = OBSERVE_TOOLS.filter(tool => WRITE_SQL.test(sources.get(tool) ?? ""))
    expect(writers, `these Observe tools now write: ${writers.join(", ")}`).toEqual([])
  })

  it("excludes every tool that sends something outside Anker", () => {
    // The Never tier from the design doc: a sent email has been read, so there
    // is no undo to fall back on.
    for (const tool of ["send_outreach", "outreach_sequence", "followup_sweep", "draft_capital_call"]) {
      expect(isObserveTool(tool), `${tool} must never be reachable from a live call`).toBe(false)
      expect(EXCLUDED_REASONS[tool], `${tool} should record why it is excluded`).toBeTruthy()
    }
  })

  it("excludes the write tools that are only deferred to a later phase", () => {
    for (const tool of ["crm_update_stage", "crm_add_task"]) {
      expect(isObserveTool(tool)).toBe(false)
      expect(EXCLUDED_REASONS[tool]).toBeTruthy()
    }
  })

  it("fails closed for anything not named", () => {
    // Includes tools that do not exist yet: an allowlist is the point.
    for (const tool of ["", "generate_image", "a_tool_added_next_year", "web_crawl"]) {
      expect(isObserveTool(tool)).toBe(false)
    }
  })

  it("bounds a live turn", () => {
    // A turn that wanders is a turn the user has stopped waiting for.
    expect(OBSERVE_MAX_STEPS).toBeLessThanOrEqual(4)
  })
})

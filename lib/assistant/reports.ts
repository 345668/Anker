import type { AssistantStep } from "./agent"

/**
 * Verified result blocks a tool wants the user to see (`ToolResult.report`).
 *
 * What a run's answer says about a tool's output used to depend on the model: the same
 * matching run came back as a 25-row summary from one model and as three firm names and a
 * file link from another. A tool that has already computed the facts can hand them over as a
 * `report`; they are appended to the answer here, once, for every surface, so the counts and
 * the list are the engine's own words and not a paraphrase.
 */
export function appendReports(answer: string, steps: AssistantStep[]): string {
  const seen = new Set<string>()
  const blocks: string[] = []
  for (const s of steps) {
    const r = s.report?.trim()
    if (!r || s.error || seen.has(r)) continue
    seen.add(r)
    // The model sometimes retypes the heading; do not print it twice.
    const heading = r.split("\n", 1)[0]
    if (answer.includes(heading)) continue
    blocks.push(r)
  }
  return blocks.length ? `${answer.trimEnd()}\n\n${blocks.join("\n\n")}` : answer
}

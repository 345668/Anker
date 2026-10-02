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
  // When a tool ran more than once (the model corrected a count, say) only its LAST report is shown:
  // the earlier one describes a run the model replaced, and printing both contradicts itself.
  const latest = new Map<string, string>()
  steps.forEach((s, i) => {
    const r = s.report?.trim()
    if (r && !s.error) latest.set(s.tool ?? `step-${i}`, r)
  })
  const blocks: string[] = []
  for (const r of latest.values()) {
    // The model sometimes retypes the heading; do not print it twice.
    if (answer.includes(r.split("\n", 1)[0])) continue
    blocks.push(r)
  }
  return blocks.length ? `${answer.trimEnd()}\n\n${blocks.join("\n\n")}` : answer
}

/**
 * When a tool that reports ran more than once, keep only the workbook from its LAST run. The earlier
 * file describes a run the model replaced, and (for score_investors) the last one already holds every
 * batch, so listing each as a download only hands the user the same rows in several incomplete files.
 */
export function keepLatestArtifacts<A extends { url: string }>(artifacts: A[], steps: AssistantStep[]): A[] {
  const last = new Map<string, number>()
  steps.forEach((s, i) => { if (s.tool && s.report && !s.error) last.set(s.tool, i) })
  const stale = new Set<string>()
  steps.forEach((s, i) => {
    if (s.tool && s.report && !s.error && s.artifact && last.get(s.tool) !== i) stale.add(s.artifact.url)
  })
  return artifacts.filter((a) => !stale.has(a.url))
}

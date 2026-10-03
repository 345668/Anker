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
const WORDS: Record<number, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve", 15: "fifteen", 20: "twenty" }

/**
 * A count the model wrote that is the number ASKED for, where the tool found fewer ("scored 40 firms" when 37
 * existed), rewritten to what was found. Only phrases that state a result are touched: a count next to a
 * result verb ("scored 40", "all 40", "top 40") or a result noun ("40 firms", "40 matches"). A number in
 * "limit: 40" or "limit 40" is the request, not a claim, and stays. Words are read too ("eight firms").
 */
export function correctCountClaims(answer: string, claim: { asked: number; found: number }): string {
  const { asked, found } = claim
  if (!(asked > found) || found < 0) return answer
  const forms = [String(asked), WORDS[asked]].filter(Boolean).join("|")
  const verb = "scored|ranked|found|matched|returned|identified|listed|shortlisted|selected|qualified|all|top|of the"
  const noun = "firms?|investors?|funds?|vcs?|matches|results|candidates|lps|family offices"
  const to = (m: string) => (/^\d+$/.test(m) ? String(found) : (WORDS[found] ?? String(found)))
  return answer
    .replace(new RegExp(`\\b(${verb})(\\s+(?:the\\s+)?)(${forms})\\b(?!\\s*[%/])`, "gi"), (_m, v, sp, n) => `${v}${sp}${to(n)}`)
    .replace(new RegExp(`\\b(${forms})(\\s+(?:\\w+[- ]){0,2}?(?:${noun}))\\b`, "gi"), (_m, n, rest) => `${to(n)}${rest}`)
}

export function appendReports(answer: string, steps: AssistantStep[]): string {
  // When a tool ran more than once (the model corrected a count, say) only its LAST report is shown:
  // the earlier one describes a run the model replaced, and printing both contradicts itself.
  const latest = new Map<string, string>()
  steps.forEach((s, i) => {
    const r = s.report?.trim()
    if (r && !s.error) latest.set(s.tool ?? `step-${i}`, r)
  })
  // A tool's notice is a fact the model may have got wrong in its own words (how many firms there really
  // were), so it goes ABOVE the model's text where it is read first, once per tool, latest run only.
  const notices = new Map<string, string>()
  steps.forEach((s, i) => { const n = s.notice?.trim(); if (!s.error) { if (n) notices.set(s.tool ?? `step-${i}`, n); else if (s.tool && s.report) notices.delete(s.tool) } })
  // The model's own count, where it is the number asked for and fewer were found, is put right in its text.
  const claims = new Map<string, { asked: number; found: number }>()
  steps.forEach((s, i) => { if (!s.error && s.tool && s.report) { if (s.countClaim) claims.set(s.tool, s.countClaim); else claims.delete(s.tool) } })
  for (const c of claims.values()) answer = correctCountClaims(answer, c)
  const blocks: string[] = []
  for (const r of latest.values()) {
    // The model sometimes retypes the heading; do not print it twice.
    if (answer.includes(r.split("\n", 1)[0])) continue
    blocks.push(r)
  }
  const top = [...notices.values()].filter((n) => !answer.includes(n))
  const body = blocks.length ? `${answer.trimEnd()}\n\n${blocks.join("\n\n")}` : answer
  return top.length ? `${top.map((n) => `**${n}**`).join("\n")}\n\n${body}` : body
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

/** Structured meeting notes (ported from the Halyard desktop `src/notes.js`; behaviour identical, proved by the differential test). */
export interface Notes { summary: string; keyPoints: string[]; decisions: string[]; actionItems: string[]; followUp: string[] }
const HEADERS: Array<[keyof Notes, RegExp]> = [
  ["summary", /^meeting summary\s*:?\s*$/i], ["keyPoints", /^key points\s*:?\s*$/i], ["decisions", /^decisions\s*:?\s*$/i], ["actionItems", /^action items\s*:?\s*$/i], ["followUp", /^follow[- ]up\s*:?\s*$/i],
]
/** Parses the model's notes blob into a record. Forgiving: filters bullets, collapses duplicates, and falls back to the summary if the model ignored the layout. */
export function parseNotes(text: string | null | undefined): Notes {
  const out: Notes = { summary: "", keyPoints: [], decisions: [], actionItems: [], followUp: [] }
  if (!text || !text.trim()) return out
  let cur: keyof Notes | null = null
  const buckets: Record<keyof Notes, string[]> = { summary: [], keyPoints: [], decisions: [], actionItems: [], followUp: [] }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^#{1,6}\s+/, "").replace(/^\*\*(.*?)\*\*:?$/, "$1")
    const matched = HEADERS.find(([, re]) => re.test(line))
    if (matched) { cur = matched[0]; continue }
    if (!cur) continue
    if (!line) continue
    buckets[cur].push(line)
  }
  for (const [k, arr] of Object.entries(buckets) as Array<[keyof Notes, string[]]>) {
    if (k === "summary") { out.summary = arr.join(" ").trim(); continue }
    ;(out as any)[k] = [...new Set(arr.map((l) => l.replace(/^[-*•]\s*/, "").replace(/^\[[ x]\]\s*/, "").replace(/^[0-9]+[.)]\s*/, "").trim()).filter(Boolean))]
  }
  if (!Object.values(buckets).some((a) => a.length) && text.trim()) out.summary = text.trim()
  return out
}

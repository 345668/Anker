/**
 * Key figures for a note, found in code rather than by the model (ported from the Halyard desktop `src/note-figures.js`). Each figure keeps the sentence it was said in and who said it.
 */
import { FIGURE_PATTERNS } from "./rolling-summary"

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
const NOTE_PATTERNS: RegExp[] = [
  ...FIGURE_PATTERNS,
  /\b\d[\d,.]*\s?(?:k|m|mm|bn)\b/gi,
  /\b\d+(?:\.\d+)?\s?x\b/gi,
  /\bQ[1-4](?:\s?(?:20)?\d{2})?\b/g,
  new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "gi"),
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})\\b`, "gi"),
  /\b\d{1,3}(?:,\d{3})+\b/g,
]
export const MAX_FIGURES = 100
const MAX_CONTEXT = 220

/** "[14:05] Them: text" or "Other participant: text" gives who and text. */
function splitLine(line: string): { who: string; text: string } {
  const m = /^\s*(?:\[\d{1,2}:\d{2}(?::\d{2})?\]\s*)?(You|Them|Other participant)\s*:\s*(.*)$/i.exec(line)
  if (!m) return { who: "", text: line.trim() }
  return { who: /^you$/i.test(m[1]) ? "You" : "Them", text: m[2].trim() }
}
const sentencesOf = (text: string): string[] => String(text).split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/).map((s) => s.trim()).filter(Boolean)

export function extractNoteFigures(transcript: string): Array<{ value: string; context: string; who: string }> {
  const out: Array<{ value: string; context: string; who: string }> = []
  const seen = new Set<string>()
  for (const line of String(transcript || "").split("\n")) {
    const { who, text } = splitLine(line)
    if (!text) continue
    for (const sentence of sentencesOf(text)) {
      const found: Array<{ value: string; at: number }> = []
      for (const re of NOTE_PATTERNS) { re.lastIndex = 0; for (const m of sentence.matchAll(re)) found.push({ value: m[0].trim(), at: m.index ?? 0 }) }
      found.sort((a, b) => a.at - b.at || b.value.length - a.value.length)         // a figure inside a longer one ("5" in "$5m") is the same figure
      const kept: Array<{ value: string; at: number }> = []
      for (const f of found) {
        if (f.value.length < 2) continue
        if (kept.some((k) => f.at >= k.at && f.at + f.value.length <= k.at + k.value.length)) continue
        kept.push(f)
      }
      for (const f of kept) {
        const key = (f.value + "|" + sentence).toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ value: f.value, context: sentence.length > MAX_CONTEXT ? sentence.slice(0, MAX_CONTEXT - 1) + "…" : sentence, who })
        if (out.length >= MAX_FIGURES) return out
      }
    }
  }
  return out
}

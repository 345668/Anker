/**
 * Rolling conversation brief: what the model still knows about the part of a long call that no longer fits (ported from the Halyard desktop `src/rolling-summary.js`).
 * The brief is REGENERATED from (previous brief + newly evicted turns), never appended to. Everything here is pure; the model call belongs to the caller, off the critical path.
 */
import type { Turn } from "./text"

/** Rough token estimate: four characters per token. */
export const estimateTokens = (text: string | null | undefined): number => Math.ceil((text || "").length / 4)
/** Brief size ceiling (the spec's 2,400 characters). */
export const MAX_BRIEF_CHARS = 2400
/** Below this, summarising costs a model call to save nothing. */
export const MIN_TURNS_TO_FOLD = 6
const speaker = (turn: Turn) => (turn.channel === "them" ? "Them" : "You")

/** Figures said out loud, found by code and handed to the model as must-keeps: numbers are cheap to find with a regex and far too expensive to lose. */
export const FIGURE_PATTERNS: RegExp[] = [
  /(?:[$€£]\s?\d[\d,.]*(?:\s?(?:k|m|bn|million|billion|thousand))?)/gi,
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d[\d,.]*)\s+(?:million|billion|thousand|percent)\b/gi,
  /\b\d+(?:\.\d+)?\s?%/g,
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+(?:LOIs?|letters? of intent|term sheets?|customers?|accounts?|months?|weeks?|days?|years?)\b/gi,
]
export function extractFigures(turns: Turn[]): string[] {
  const seen = new Set<string>()
  for (const t of turns) for (const re of FIGURE_PATTERNS) for (const match of String(t.text || "").matchAll(re)) { const value = match[0].trim(); if (value.length > 2) seen.add(value) }
  return [...seen].slice(0, 25)
}
/** The prompt that folds evicted turns into the brief. Given the previous brief and asked to rewrite it, which is what keeps the result bounded. */
export function buildFoldPrompt(previousBrief: string, turns: Turn[]): string {
  const lines = turns.map((t) => `${speaker(t)}: ${t.text}`).join("\n")
  const figures = extractFigures(turns)
  return [
    previousBrief ? `Running brief of this conversation so far:\n${previousBrief}\n` : "There is no brief yet; this is the start of the conversation.\n",
    `Part of the conversation that is about to fall out of the live window:\n${lines}\n`,
    figures.length ? `These figures and quantities were said out loud. Carry every one of them into the brief, exactly as stated, unless a later statement replaces it:\n${figures.map((f) => `- ${f}`).join("\n")}\n` : "",
    "Rewrite the running brief so it covers both. Keep it under 250 words.",
    "MUST keep: every name, company, figure, percentage and date; anything either party committed to, agreed, signed or promised — including letters of intent, term sheets, introductions offered and deadlines; and any question that was asked and not answered.",
    "A signed agreement or an offered introduction IS a commitment. Never write that there are no commitments while one appears above.",
    "Drop: pleasantries, filler, and anything a later statement superseded.",
    'Record only what was said. Do not add assessment, do not note what was "unclear" or "needs further discussion", and do not suggest what should happen next.',
    "Output the brief itself as plain dash-prefixed lines. No heading, no preamble, no markdown bold.",
  ].filter(Boolean).join("\n")
}
export const shouldFold = (pendingTurns: unknown): boolean => Array.isArray(pendingTurns) && pendingTurns.length >= MIN_TURNS_TO_FOLD
/** Accepts a model-written brief: strips markdown headings and bold, and truncates on a sentence boundary where one is available. */
export function applyFold(text: string | null | undefined): string {
  const brief = (text || "").replace(/\*\*/g, "").replace(/^#{1,6}\s*/gm, "").replace(/^\s*running brief\s*:?\s*$/gim, "").trim()
  if (!brief) return ""
  if (brief.length <= MAX_BRIEF_CHARS) return brief
  const cut = brief.slice(0, MAX_BRIEF_CHARS)
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "))
  return (lastBreak > MAX_BRIEF_CHARS * 0.6 ? cut.slice(0, lastBreak + 1) : cut).trim()
}
/** The block prepended to a prompt, labelled as earlier and summarised so the model does not quote it as if someone said it. */
export function formatBrief(brief: string | null | undefined): string {
  const text = (brief || "").trim()
  return text ? `Earlier in this conversation (summarised, not verbatim):\n${text}` : ""
}
/** Fits the brief and the recent turns into a token budget: the brief is kept whole and the verbatim window is trimmed from the oldest end. */
export function fitToBudget(brief: string, turns: Turn[], maxTokens: number): { brief: string; turns: Turn[]; tokens: number } {
  const block = formatBrief(brief)
  const budget = Math.max(0, maxTokens || 0)
  let used = estimateTokens(block)
  const kept: Turn[] = []
  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = estimateTokens(`${speaker(turns[i])}: ${turns[i].text}`) + 1
    if (used + cost > budget) break
    used += cost
    kept.unshift(turns[i])
  }
  return { brief: block, turns: kept, tokens: used }
}

/**
 * What a running LP match tells the person watching (docs/architecture/63 section 4.1): where the work is, in words, and how much of it is done.
 * The engine reports phases and counts; this turns them into one position on a 0 to 100 scale. The numbers are the share of work, not a time estimate.
 */
import type { ProgressEvent } from "@/lib/matching/v2/types"

export type Phase = "queued" | "rules" | "loading" | "scoring" | "finishing" | "saving" | "done" | "failed"
export interface Progress { phase: Phase; label: string; pct: number }

export const QUEUED: Progress = { phase: "queued", label: "Waiting to start", pct: 0 }
export const RULES: Progress = { phase: "rules", label: "Applying your rules", pct: 3 }
export const SAVING: Progress = { phase: "saving", label: "Saving the results", pct: 95 }
export const DONE: Progress = { phase: "done", label: "Finished", pct: 100 }

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)
const n = (v: number) => v.toLocaleString("en-US")

/** The position an engine event stands for, or null for an event that does not move it. */
export function fromEngineEvent(e: ProgressEvent): Progress | null {
  switch (e.phase) {
    case "loading": return /investor/i.test(e.message) ? { phase: "loading", label: "Loading people from the directory", pct: 14 } : { phase: "loading", label: "Loading firms from the directory", pct: 8 }
    case "scoring": {
      const f = clamp01(e.total ? e.processed / e.total : 1)
      return e.entity === "firms"
        ? { phase: "scoring", label: `Scoring firms (${n(e.processed)} of ${n(e.total)})`, pct: Math.round(18 + 22 * f) }
        : { phase: "scoring", label: `Scoring people (${n(e.processed)} of ${n(e.total)})`, pct: Math.round(40 + 42 * f) }
    }
    case "deduplication": return { phase: "finishing", label: "Merging duplicates", pct: 84 }
    case "ai_enrichment": return { phase: "finishing", label: `Writing the reasons (${n(e.processed)} of ${n(e.total)})`, pct: Math.round(88 + 7 * clamp01(e.total ? e.processed / e.total : 1)) }
    default: return null
  }
}

/** Writes a position at most every `gapMs`, but always when the phase changes, so a long phase does not flood the database and a new one is never hidden. */
export function throttled(write: (p: Progress) => Promise<void> | void, gapMs = 1200, now: () => number = Date.now) {
  let last = 0, lastPhase: string | null = null, pending: Promise<void> = Promise.resolve()
  return {
    push(p: Progress) {
      const t = now()
      if (p.phase === lastPhase && t - last < gapMs) return
      last = t; lastPhase = p.phase
      pending = pending.then(() => Promise.resolve(write(p)).catch(() => {}))
    },
    /** Resolves when everything pushed so far has been written. */
    flush: () => pending,
  }
}

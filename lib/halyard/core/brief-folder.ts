/**
 * Fold orchestration for the rolling brief (ported from the Halyard desktop `src/brief-folder.js`): when to run and what to do when it goes wrong. Everything it needs is injected:
 * the model, the timer, the busy check. `rolling-summary` owns the prompt and the size rules.
 */
import * as rollingSummary from "./rolling-summary"
import type { Turn } from "./text"

export const SYSTEM = "You keep a running brief of a live conversation. Return only the brief."
export interface BriefLlm { ready?: boolean; stream(args: { system: string; turns: Array<{ role: string; text: string }>; onToken: (t: string) => void }): Promise<unknown> }
export interface BriefFolderDeps {
  /** Builds a model client from current settings. */
  createLLM: () => BriefLlm | null | undefined
  /** True while the user is waiting on an answer: a summary must never cost the conversation latency. */
  isBusy: () => boolean
  delayMs: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (t: unknown) => void
  onError?: (msg: string) => void
}

export function createBriefFolder(deps: BriefFolderDeps) {
  const setTimer = deps.setTimer || ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer || ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>))
  const onError = deps.onError || (() => {})
  let brief = ""
  let pending: Turn[] = []
  let timer: unknown = null
  let folding = false

  function schedule() {
    if (timer || !rollingSummary.shouldFold(pending)) return
    timer = setTimer(() => { timer = null; void fold() }, deps.delayMs)
  }
  async function fold(): Promise<boolean> {
    if (folding || deps.isBusy() || !rollingSummary.shouldFold(pending)) return false
    folding = true
    const batch = pending
    pending = []
    try {
      const llm = deps.createLLM()
      if (!llm || !llm.ready) { pending = batch.concat(pending); return false }          // no provider yet: keep the turns for when there is
      let out = ""
      await llm.stream({ system: SYSTEM, turns: [{ role: "user", text: rollingSummary.buildFoldPrompt(brief, batch) }], onToken: (t) => { out += t } })
      const next = rollingSummary.applyFold(out)
      if (next) brief = next                                                               // a blank response leaves the previous brief standing
      return !!next
    } catch (error) {
      pending = batch.concat(pending)                                                      // a retry, not a permanent loss of that stretch of the conversation
      onError(error && (error as Error).message ? (error as Error).message : String(error))
      return false
    } finally {
      folding = false
      schedule()
    }
  }
  return {
    /** Turns evicted from the live window, to be folded rather than dropped. */
    push(turns: Turn[]) { if (!Array.isArray(turns) || !turns.length) return; pending.push(...turns); schedule() },
    /** Runs now, ignoring the lull timer. Used at the end of a call. */
    fold,
    getBrief: () => brief,
    block: () => rollingSummary.formatBrief(brief),
    pendingCount: () => pending.length,
    reset() { brief = ""; pending = []; if (timer) { clearTimer(timer); timer = null } },
  }
}

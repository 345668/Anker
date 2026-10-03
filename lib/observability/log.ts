/**
 * Structured, single-line JSON logs with a run id (docs/architecture/37 §5.4).
 *
 * A platform-level kill (the function's time limit) leaves no application error, only the last line written, so the
 * lines that matter are the BOUNDARIES: a run starting, a tool or model call starting and ending, a run ending. When a
 * request dies silently, the last boundary line names the step it was in. This is how the founder-matching hang would
 * have been found by reading instead of by reasoning.
 *
 * Rules: no prompt text, no tool input, no personal data, no secrets; ids, names, durations, sizes and outcomes only.
 * This file imports nothing, so any module can use it without creating a cycle.
 */
export type LogFields = Record<string, string | number | boolean | null | undefined>

export function logEvent(evt: string, fields: LogFields = {}, runId?: string | null): void {
  try {
    console.log(JSON.stringify({ ts: new Date().toISOString(), evt, ...(runId ? { run_id: runId } : {}), ...fields }))
  } catch {
    /* logging must never break a run */
  }
}

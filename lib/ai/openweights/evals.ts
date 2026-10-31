/**
 * The open-weights evaluation harness (docs/architecture/53 section 8, P0). A fixed set of cases per task, run against any OpenAI-compatible endpoint (the gateway, vLLM, or the current
 * cloud lane as the reference), scored by code: valid structured output, the right label, the length rule, latency p50 and p95, and agreement with the reference. It decides nothing by
 * itself: it produces the numbers and says which adoption bar each task met. `pnpm eval:openweights` runs it (see evals.run.test.ts); nothing here is called by the product.
 */
export interface Endpoint { baseUrl: string; apiKey: string; model: string; label: string }
export interface Case { id: string; prompt: string; json?: boolean; maxTokens?: number; /** Scores one answer: valid structured output, and correct against the case's own truth (null when there is no truth). */ score(text: string): { valid: boolean; correct: boolean | null; label?: string; note?: string } }
export interface Suite { task: string; cases: Case[]; /** Adoption bars (section 8, to be confirmed with the founder). */ bars: { validRate: number; accuracy?: number; agreement?: number } }
export interface CaseRun { id: string; ok: boolean; ms: number; text: string; valid: boolean; correct: boolean | null; label?: string; failure?: string }
export interface SuiteReport { task: string; endpoint: string; n: number; validRate: number; accuracy: number | null; agreement: number | null; p50: number; p95: number; failures: Record<string, number>; passed: boolean; misses: string[] }

export const percentile = (xs: number[], p: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] }

export async function ask(ep: Endpoint, c: Case, fetchImpl: typeof fetch = fetch, timeoutMs = 120_000): Promise<CaseRun> {
  const t0 = performance.now()
  try {
    const res = await fetchImpl(`${ep.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs), headers: { "Content-Type": "application/json", "x-api-key": ep.apiKey, Authorization: `Bearer ${ep.apiKey}` },
      body: JSON.stringify({ model: ep.model, messages: [{ role: "user", content: c.prompt }], max_tokens: c.maxTokens ?? 400, temperature: 0, ...(c.json ? { response_format: { type: "json_object" } } : {}) }),
    })
    const ms = Math.round(performance.now() - t0)
    if (!res.ok) return { id: c.id, ok: false, ms, text: "", valid: false, correct: null, failure: `http_${res.status}` }
    const text = String(((await res.json().catch(() => ({}))) as any)?.choices?.[0]?.message?.content ?? "").trim()
    if (!text) return { id: c.id, ok: false, ms, text, valid: false, correct: null, failure: "empty" }
    const s = c.score(text)
    return { id: c.id, ok: true, ms, text, valid: s.valid, correct: s.correct, label: s.label, ...(s.valid ? {} : { failure: s.note ?? "invalid" }) }
  } catch (e: any) { return { id: c.id, ok: false, ms: Math.round(performance.now() - t0), text: "", valid: false, correct: null, failure: e?.name === "TimeoutError" ? "timeout" : "network" } }
}

/** Runs a suite against a candidate (and optionally a reference), a few at a time. Returns the report; the reference's labels give agreement. */
export async function runSuite(s: Suite, candidate: Endpoint, reference?: Endpoint, fetchImpl: typeof fetch = fetch, concurrency = 2): Promise<{ report: SuiteReport; runs: CaseRun[] }> {
  const run = async (ep: Endpoint) => { const out: CaseRun[] = new Array(s.cases.length); let i = 0; await Promise.all(Array.from({ length: concurrency }, async () => { for (;;) { const k = i++; if (k >= s.cases.length) return; out[k] = await ask(ep, s.cases[k], fetchImpl) } })); return out }
  const runs = await run(candidate), ref = reference ? await run(reference) : null
  const n = runs.length, valid = runs.filter((r) => r.valid).length, graded = runs.filter((r) => r.correct !== null)
  const failures: Record<string, number> = {}; for (const r of runs) if (r.failure) failures[r.failure] = (failures[r.failure] ?? 0) + 1
  const both = ref ? runs.map((r, i) => [r, ref[i]] as const).filter(([a, b]) => a.label && b.label) : []
  const accuracy = graded.length ? graded.filter((r) => r.correct).length / graded.length : null, agreement = ref ? (both.length ? both.filter(([a, b]) => a.label === b.label).length / both.length : 0) : null
  const validRate = valid / n, lat = runs.map((r) => r.ms)
  const passed = validRate >= s.bars.validRate && (s.bars.accuracy === undefined || (accuracy !== null && accuracy >= s.bars.accuracy)) && (s.bars.agreement === undefined || (agreement !== null && agreement >= s.bars.agreement))
  return { runs, report: { task: s.task, endpoint: candidate.label, n, validRate, accuracy, agreement, p50: percentile(lat, 50), p95: percentile(lat, 95), failures, passed, misses: runs.filter((r, i) => !r.valid || r.correct === false).map((r) => r.id) } }
}
export const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`)
export function markdown(reports: SuiteReport[], when = new Date().toISOString().slice(0, 10)): string {
  return [`# Open-weights evaluation, ${when}`, "", "Bars: valid structured output at least 95%, classification accuracy and agreement with the reference at least 90% (docs/architecture/53 section 8). Latency is measured from the client.", "",
    "| Task | Model | Cases | Valid | Accuracy | Agreement | p50 ms | p95 ms | Failures | Bar |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ...reports.map((r) => `| ${r.task} | ${r.endpoint} | ${r.n} | ${pct(r.validRate)} | ${pct(r.accuracy)} | ${pct(r.agreement)} | ${r.p50} | ${r.p95} | ${Object.entries(r.failures).map(([k, v]) => `${k} ${v}`).join(", ") || "none"} | ${r.passed ? "met" : "NOT met"} |`),
    "", "A task that met its bar is a candidate for the lane, not yet adopted: add its name to OPENWEIGHTS_EVAL_PASSED after a person reads the misses and the model's licence is cleared."].join("\n")
}

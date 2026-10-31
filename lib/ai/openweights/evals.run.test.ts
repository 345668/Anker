import { describe, expect, it, vi } from "vitest"
import { writeFileSync } from "node:fs"
vi.mock("server-only", () => ({}))
import { runSuite, markdown, type Endpoint } from "./evals"
import { SUITES } from "./evals-suites"

/**
 * P0 of docs/architecture/53, the real run. Off unless RUN_EVALS=1. Needs a model endpoint (the gateway or vLLM) and, for agreement, a reference endpoint (the cloud lane):
 *   RUN_EVALS=1 OW_BASE_URL=https://... OW_API_KEY=... OW_MODEL=Qwen/Qwen3-8B [REF_BASE_URL=... REF_API_KEY=... REF_MODEL=...] [EVAL_REPORT=report.md] pnpm eval:openweights
 * It sends only the fixed cases in evals-suites.ts (invented replies and URLs; no customer data) and never writes a key anywhere.
 */
describe.skipIf(process.env.RUN_EVALS !== "1")("open-weights evaluation (P0)", () => {
  it("runs every suite against the configured model and prints the report", async () => {
    const e = process.env
    if (!e.OW_BASE_URL || !e.OW_API_KEY || !e.OW_MODEL) throw new Error("Set OW_BASE_URL, OW_API_KEY and OW_MODEL.")
    const cand: Endpoint = { baseUrl: e.OW_BASE_URL, apiKey: e.OW_API_KEY, model: e.OW_MODEL, label: e.OW_MODEL }
    const ref: Endpoint | undefined = e.REF_BASE_URL && e.REF_API_KEY && e.REF_MODEL ? { baseUrl: e.REF_BASE_URL, apiKey: e.REF_API_KEY, model: e.REF_MODEL, label: e.REF_MODEL } : undefined
    const reports = []; for (const s of SUITES) reports.push((await runSuite(s, cand, ref)).report)
    const md = markdown(reports); console.log("\n" + md); if (e.EVAL_REPORT) writeFileSync(e.EVAL_REPORT, md + "\n")
    expect(reports.length).toBe(SUITES.length)
  }, 1_800_000)
})

/** Against a running worker: DOC_WORKER_TEST_URL=http://localhost:18080 DOC_WORKER_TEST_TOKEN=... pnpm vitest run lib/docworker. Skipped otherwise. */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { convertViaDocWorker } from "./client"

const url = process.env.DOC_WORKER_TEST_URL
const docx = process.env.DOC_WORKER_TEST_DOCX
describe.skipIf(!url || !docx)("convertViaDocWorker against a real worker", () => {
  it("converts a Word file to a real PDF, streamed", async () => {
    process.env.DOC_WORKER_URL = url!; process.env.DOC_WORKER_TOKEN = process.env.DOC_WORKER_TEST_TOKEN
    const out = await convertViaDocWorker(readFileSync(docx!), "input.docx", "pdf")
    expect(out.ok).toBe(true)
    if (out.ok) { const b = Buffer.from(await out.response.arrayBuffer()); expect(b.subarray(0, 5).toString()).toBe("%PDF-"); expect(b.length).toBeGreaterThan(5000) }
  }, 60000)
  it("a wrong token is a plain error, not an exception", async () => {
    process.env.DOC_WORKER_URL = url!; process.env.DOC_WORKER_TOKEN = "wrong"
    const out = await convertViaDocWorker(readFileSync(docx!), "input.docx", "pdf")
    expect(out.ok).toBe(false)
  })
  it("a worker that is not there is a 502, not an exception", async () => {
    process.env.DOC_WORKER_URL = "http://127.0.0.1:1"
    const out = await convertViaDocWorker(Buffer.from("x"), "input.docx", "pdf", 3000)
    expect(out).toMatchObject({ ok: false, status: 502 })
  })
})

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import type { AiPrincipal } from "@/lib/assistant/context"

const state = vi.hoisted(() => ({ query: null as any }))
vi.mock("@/lib/db", () => ({
  sql: Object.assign(
    (s: TemplateStringsArray, ...v: unknown[]) =>
      state.query(
        s.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""),
        v,
      ),
    { unsafe: (q: string, v: unknown[] = []) => state.query(q, v) },
  ),
}))
vi.mock("server-only", () => ({}))

import { CONSENT_VERSION, recordConsent } from "./consent"
import { artifactSetHash, currentSetHash, isApproved, submitReview } from "./review"
import {
  _resetReplaceFlagCache,
  assertMayRun,
  createPipeline,
  getPipeline,
  replaceEnabled,
  retryStage,
  runNextStage,
  type Runners,
} from "./runner"

let db: PGlite
const principal = (userId = "u1", scopeKey = "org:one", extra: Partial<AiPrincipal> = {}): AiPrincipal => ({
  userId,
  scopeKey,
  orgId: scopeKey.slice(4),
  persona: "vc",
  membership: null,
  lpMemberships: [],
  canWrite: true,
  readonly: false,
  allowedTools: null,
  ...extra,
})
const sha = (c: string) => c.repeat(64).slice(0, 64)
const attest = {
  ownsOrMayUseSource: true,
  everyPersonInSourceAgreed: true,
  everyReferenceIdentityAgreed: true,
  noPublicFigureOrMinor: true,
  understandsProvenance: true,
}
const consentBody = (extra: object = {}) => ({
  statementVersion: CONSENT_VERSION,
  attest,
  subjects: "Dana (founder, source) replaced by the character in reference one",
  sourceSha256: sha("a"),
  referenceSha256: [sha("b")],
  ...extra,
})
const art = (kind: string, c: string) => ({
  kind,
  pathname: `p/${kind}`,
  contentType: "video/mp4",
  bytes: 10,
  sha256: sha(c),
})
const calls: string[] = []
const runners = (over: Runners = {}): Runners => ({
  ingest: async () => (calls.push("ingest"), { artifacts: [art("source", "1")] }),
  normalise: async () => (calls.push("normalise"), { artifacts: [art("prepared", "2")] }),
  generate_draft: async () => (
    calls.push("generate_draft"),
    { artifacts: [art("draft", "3")], jobId: "job-1" }
  ),
  generate_final: async () => (calls.push("generate_final"), { artifacts: [art("final", "4")] }),
  restore_audio: async () => (calls.push("restore_audio"), { artifacts: [art("restored", "5")] }),
  deliver: async () => (calls.push("deliver"), {}),
  ...over,
})
async function start(p = principal()) {
  const { id: consentId } = await recordConsent(
    p,
    consentBody({ sourceSha256: sha(randomUUID().slice(0, 1) || "a") }),
  )
  return createPipeline(p, { requestKey: randomUUID(), consentId })
}

beforeAll(async () => {
  db = new PGlite()
  state.query = async (q: string, v: unknown[]) => (await db.query(q, v)).rows
  await db.exec(
    "CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text)",
  )
  await db.exec(readFileSync("scripts/migrations/2026-10-11-ai-studio-pipelines.sql", "utf8"))
}, 30000)
afterAll(() => db.close())
beforeEach(async () => {
  await db.exec(
    "TRUNCATE ai_studio_reviews, ai_studio_artifacts, ai_studio_stages, ai_studio_pipelines, ai_studio_consents CASCADE",
  )
  calls.length = 0
  _resetReplaceFlagCache()
})

describe("consent", () => {
  it("refuses anything but a full attestation", async () => {
    const p = principal()
    await expect(
      recordConsent(p, consentBody({ attest: { ...attest, everyPersonInSourceAgreed: false } })),
    ).rejects.toThrow()
    await expect(
      recordConsent(p, consentBody({ attest: { ...attest, noPublicFigureOrMinor: undefined } })),
    ).rejects.toThrow()
    await expect(recordConsent(p, consentBody({ statementVersion: "1999-01-01" }))).rejects.toThrow()
    await expect(recordConsent(p, consentBody({ subjects: "x" }))).rejects.toThrow()
    await expect(recordConsent(p, consentBody({ referenceSha256: [] }))).rejects.toThrow()
  })
  it("stores who gave it, for which files, and whether the voice is altered", async () => {
    const { id } = await recordConsent(principal(), consentBody({ voiceAltered: true }))
    const [r] = (await db.query("SELECT * FROM ai_studio_consents WHERE id=$1", [id])).rows as any[]
    expect(r).toMatchObject({
      user_id: "u1",
      scope_key: "org:one",
      statement_version: CONSENT_VERSION,
      voice_altered: true,
    })
    expect(r.source_sha256).toBe(sha("a"))
  })
  it("a read-only member cannot give it", async () => {
    await expect(
      recordConsent(principal("u1", "org:one", { readonly: true }), consentBody()),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      recordConsent(principal("u1", "org:one", { canWrite: false }), consentBody()),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe("pipelines", () => {
  it("needs a stored consent of the same person and workspace", async () => {
    const { id } = await recordConsent(principal(), consentBody())
    await expect(
      createPipeline(principal("u2"), { requestKey: randomUUID(), consentId: id }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      createPipeline(principal("u1", "org:two"), { requestKey: randomUUID(), consentId: id }),
    ).rejects.toMatchObject({ status: 400 })
  })
  it("creates the recipe's stages in order, and the same request key returns the same pipeline", async () => {
    const p = principal()
    const { id: consentId } = await recordConsent(p, consentBody())
    const key = randomUUID()
    const a = await createPipeline(p, { requestKey: key, consentId })
    const b = await createPipeline(p, { requestKey: key, consentId })
    expect(b.id).toBe(a.id)
    expect(a.stages.map((s) => s.kind)).toEqual([
      "ingest",
      "normalise",
      "review_input",
      "generate_draft",
      "approve_final",
      "generate_final",
      "restore_audio",
      "deliver",
    ])
    expect(a.stages.every((s) => s.status === "pending")).toBe(true)
  })
  it("one consent covers one pipeline: new footage needs a new consent", async () => {
    const p = principal()
    const { id: consentId } = await recordConsent(p, consentBody())
    await createPipeline(p, { requestKey: randomUUID(), consentId })
    await expect(createPipeline(p, { requestKey: randomUUID(), consentId })).rejects.toMatchObject({
      status: 409,
    })
  })
  it("another workspace or user cannot see or run it", async () => {
    const pipe = await start()
    await expect(getPipeline(principal("u2"), pipe.id)).rejects.toMatchObject({ status: 404 })
    await expect(getPipeline(principal("u1", "org:two"), pipe.id)).rejects.toMatchObject({ status: 404 })
    await expect(runNextStage(principal("u1", "org:two"), pipe.id, runners())).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe("the runner", () => {
  it("runs stages in order and stops at the review: the gate is never run for a person", async () => {
    const p = principal()
    const pipe = await start(p)
    expect(await runNextStage(p, pipe.id, runners())).toMatchObject({ ran: "ingest" })
    expect(await runNextStage(p, pipe.id, runners())).toMatchObject({ ran: "normalise" })
    expect(await runNextStage(p, pipe.id, runners())).toEqual({ ran: null, status: "awaiting_review" })
    expect(calls).toEqual(["ingest", "normalise"])
    expect((await getPipeline(p, pipe.id)).status).toBe("awaiting_review")
  })
  it("a stage that is already running is not started twice", async () => {
    const p = principal()
    const pipe = await start(p)
    let n = 0
    const slow: Runners = {
      ingest: async () => (
        n++,
        await new Promise((r) => setTimeout(r, 30)),
        { artifacts: [art("source", "1")] }
      ),
    }
    await Promise.all([runNextStage(p, pipe.id, runners(slow)), runNextStage(p, pipe.id, runners(slow))])
    expect(n).toBe(1)
  })
  it("a step that is not built yet says so instead of silently passing", async () => {
    const p = principal()
    const pipe = await start(p)
    await expect(runNextStage(p, pipe.id, {})).rejects.toMatchObject({ status: 501 })
  })
})

async function toReview(p: AiPrincipal) {
  const pipe = await start(p)
  for (let i = 0; i < 3; i++) await runNextStage(p, pipe.id, runners())
  return pipe
}

describe("the review gate", () => {
  it("refuses a paid step until the exact prepared files are approved", async () => {
    const p = principal()
    const pipe = await toReview(p)
    await expect(assertMayRun(pipe.id, "generate_draft")).rejects.toMatchObject({ status: 409 })
    await expect(runNextStage(p, pipe.id, runners())).resolves.toMatchObject({
      ran: null,
      status: "awaiting_review",
    })
    expect(calls).not.toContain("generate_draft")
  })
  it("a decision on stale files is refused", async () => {
    const p = principal()
    const pipe = await toReview(p)
    await expect(
      submitReview(p, pipe.id, "input", { approved: true, expectedHash: sha("f") }),
    ).rejects.toMatchObject({ status: 409 })
  })
  it("approval of the exact files lets the draft run; it cannot be given before the earlier steps finish", async () => {
    const p = principal()
    const early = await start(p)
    await expect(
      submitReview(p, early.id, "input", { approved: true, expectedHash: "x" }),
    ).rejects.toMatchObject({ status: 409 })
    const pipe = await toReview(p)
    const hash = await currentSetHash(pipe.id, "input")
    await submitReview(p, pipe.id, "input", {
      approved: true,
      expectedHash: hash,
      note: "mask and framing look right",
    })
    expect(await isApproved(pipe.id, "input")).toBe(true)
    expect(await runNextStage(p, pipe.id, runners())).toMatchObject({ ran: "generate_draft" })
    expect(calls).toContain("generate_draft")
  })
  it("a one-byte change to a reviewed file voids the approval", async () => {
    const p = principal()
    const pipe = await toReview(p)
    await submitReview(p, pipe.id, "input", {
      approved: true,
      expectedHash: await currentSetHash(pipe.id, "input"),
    })
    await db.query("UPDATE ai_studio_artifacts SET sha256=$2 WHERE pipeline_id=$1 AND kind='prepared'", [
      pipe.id,
      sha("9"),
    ])
    expect(await isApproved(pipe.id, "input")).toBe(false)
    await expect(assertMayRun(pipe.id, "generate_draft")).rejects.toMatchObject({ status: 409 })
  })
  it("so does a change to who was said to have agreed", async () => {
    const p = principal()
    const pipe = await toReview(p)
    await submitReview(p, pipe.id, "input", {
      approved: true,
      expectedHash: await currentSetHash(pipe.id, "input"),
    })
    await db.query(
      "UPDATE ai_studio_consents SET subjects='someone else entirely' WHERE id=(SELECT consent_id FROM ai_studio_pipelines WHERE id=$1)",
      [pipe.id],
    )
    expect(await isApproved(pipe.id, "input")).toBe(false)
  })
  it("a rejection ends the pipeline and nothing paid runs", async () => {
    const p = principal()
    const pipe = await toReview(p)
    await submitReview(p, pipe.id, "input", {
      approved: false,
      expectedHash: await currentSetHash(pipe.id, "input"),
      note: "hair mask is wrong",
    })
    expect((await getPipeline(p, pipe.id)).status).toBe("canceled")
    await expect(
      submitReview(p, pipe.id, "input", { approved: true, expectedHash: "x" }),
    ).rejects.toMatchObject({ status: 409 })
    expect(await runNextStage(p, pipe.id, runners())).toMatchObject({ ran: null, status: "failed" })
    expect(calls).not.toContain("generate_draft")
  })
  it("the final render needs its own approval of the draft that was seen", async () => {
    const p = principal()
    const pipe = await toReview(p)
    await submitReview(p, pipe.id, "input", {
      approved: true,
      expectedHash: await currentSetHash(pipe.id, "input"),
    })
    await runNextStage(p, pipe.id, runners()) // draft
    await expect(assertMayRun(pipe.id, "generate_final")).rejects.toMatchObject({ status: 409 })
    expect(await runNextStage(p, pipe.id, runners())).toEqual({ ran: null, status: "awaiting_review" })
    await submitReview(p, pipe.id, "final", {
      approved: true,
      expectedHash: await currentSetHash(pipe.id, "final"),
    })
    expect(await runNextStage(p, pipe.id, runners())).toMatchObject({ ran: "generate_final" })
    for (let i = 0; i < 2; i++) await runNextStage(p, pipe.id, runners())
    expect(await runNextStage(p, pipe.id, runners())).toEqual({ ran: null, status: "completed" })
    expect(calls).toEqual([
      "ingest",
      "normalise",
      "generate_draft",
      "generate_final",
      "restore_audio",
      "deliver",
    ])
  })
})

describe("paid steps are never retried automatically", () => {
  it("a failed draft stays failed; retry is refused; a free step may be retried", async () => {
    const p = principal()
    const pipe = await toReview(p)
    await submitReview(p, pipe.id, "input", {
      approved: true,
      expectedHash: await currentSetHash(pipe.id, "input"),
    })
    const boom: Runners = {
      generate_draft: async () => {
        throw new Error("provider timed out")
      },
    }
    expect(await runNextStage(p, pipe.id, runners(boom))).toMatchObject({
      ran: "generate_draft",
      status: "failed",
    })
    expect(await runNextStage(p, pipe.id, runners())).toEqual({ ran: null, status: "failed" })
    expect(calls).not.toContain("generate_draft")
    const failed = (await getPipeline(p, pipe.id)).stages.find((s) => s.kind === "generate_draft")!
    expect(failed.error).toContain("provider timed out")
    await expect(retryStage(p, pipe.id, failed.ord)).rejects.toMatchObject({ status: 409 })

    const second = await start(p)
    const flaky: Runners = {
      ingest: async () => {
        throw new Error("bad container")
      },
    }
    expect(await runNextStage(p, second.id, runners(flaky))).toMatchObject({ status: "failed" })
    await retryStage(p, second.id, 0)
    expect(await runNextStage(p, second.id, runners())).toMatchObject({ ran: "ingest" })
  })
})

describe("the platform flag", () => {
  it("is off until switched on, and a failed read means off", async () => {
    expect(await replaceEnabled()).toBe(false)
    await db.query(
      "INSERT INTO platform_flags(key,enabled) VALUES('ai_studio_replace',true) ON CONFLICT (key) DO UPDATE SET enabled=true",
    )
    _resetReplaceFlagCache()
    expect(await replaceEnabled()).toBe(true)
    await db.query("UPDATE platform_flags SET enabled=false WHERE key='ai_studio_replace'")
  })
})

describe("the set hash", () => {
  it("ignores order and changes when a file is added, removed or altered", () => {
    const a = [
      { kind: "x", sha256: sha("1") },
      { kind: "y", sha256: sha("2") },
    ]
    expect(artifactSetHash(a)).toBe(artifactSetHash([...a].reverse()))
    expect(artifactSetHash(a)).not.toBe(artifactSetHash(a.slice(1)))
    expect(artifactSetHash(a)).not.toBe(artifactSetHash([a[0], { kind: "y", sha256: sha("3") }]))
  })
})

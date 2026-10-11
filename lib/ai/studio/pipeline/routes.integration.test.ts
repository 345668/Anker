import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import type { AiPrincipal } from "@/lib/assistant/context"

const state = vi.hoisted(() => ({ query: null as any, principal: null as any }))
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
vi.mock("@/lib/assistant/principal", () => ({
  requireAiPrincipal: vi.fn(async () => {
    if (state.principal instanceof Error) throw state.principal
    return state.principal
  }),
}))
vi.mock("server-only", () => ({}))
vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(async () => null), del: vi.fn() }))
vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn(async () => ({ type: "blob.generate-client-token", clientToken: "t" })),
}))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: true }), AI_HEAVY: {} }))

import { CONSENT_VERSION } from "./consent"
import { uploadRule } from "./api"
import { _resetReplaceFlagCache } from "./runner"
import { pipelinePath } from "./storage"
import { POST as consentPOST } from "@/app/api/anker/studio/pipelines/consent/route"
import { GET as listGET, POST as createPOST } from "@/app/api/anker/studio/pipelines/route"
import { GET as detailGET } from "@/app/api/anker/studio/pipelines/[id]/route"
import { POST as reviewPOST } from "@/app/api/anker/studio/pipelines/[id]/review/route"
import { POST as runPOST } from "@/app/api/anker/studio/pipelines/[id]/run/route"
import { GET as artifactGET } from "@/app/api/anker/studio/pipelines/[id]/artifacts/[kind]/route"
import { POST as uploadPOST } from "@/app/api/anker/studio/pipelines/upload/route"
import { handleUpload } from "@vercel/blob/client"

let db: PGlite
const me = (userId = "u1", scopeKey = "org:one", extra: Partial<AiPrincipal> = {}): AiPrincipal => ({
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
const sha = (c: string) => c.repeat(64)
const attest = {
  ownsOrMayUseSource: true,
  everyPersonInSourceAgreed: true,
  everyReferenceIdentityAgreed: true,
  noPublicFigureOrMinor: true,
  understandsProvenance: true,
}
const post = (body: unknown, origin?: string) =>
  new Request("https://anker.example/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  })
const ctx = (id: string, extra: { kind?: string } = {}) => ({
  params: Promise.resolve({ id, kind: "source", ...extra }),
})
const setFlag = async (on: boolean) => {
  await db.query(
    "INSERT INTO platform_flags(key,enabled) VALUES('ai_studio_replace',$1) ON CONFLICT (key) DO UPDATE SET enabled=$1",
    [on],
  )
  _resetReplaceFlagCache()
}
async function made(p = me()) {
  state.principal = p
  const c = await consentPOST(
    post({
      scopeKey: p.scopeKey,
      statementVersion: CONSENT_VERSION,
      attest,
      subjects: "Our own test clip",
      sourceSha256: sha("a"),
      referenceSha256: [sha("b")],
    }),
  )
  const { id } = await c.json()
  const r = await createPOST(post({ scopeKey: p.scopeKey, requestKey: randomUUID(), consentId: id }))
  return { status: r.status, body: await r.json() }
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
  state.principal = me()
  await setFlag(true)
  vi.mocked(handleUpload).mockClear()
})

describe("the platform flag", () => {
  it("makes every route answer 'not available' when it is off, whoever asks", async () => {
    const { body } = await made()
    await setFlag(false)
    const id = body.pipeline.id
    const answers = await Promise.all([
      consentPOST(post({})),
      createPOST(post({})),
      listGET(new Request("https://anker.example/x?scopeKey=org:one")),
      detailGET(new Request("https://anker.example/x"), ctx(id)),
      runPOST(post({}), ctx(id)),
      reviewPOST(post({}), ctx(id)),
      artifactGET(new Request("https://anker.example/x"), ctx(id, { kind: "source" })),
      uploadPOST(post({})),
    ])
    expect(answers.map((r) => r.status)).toEqual(Array(8).fill(404))
  })
  it("a signed-out visitor is refused, not told the feature exists", async () => {
    state.principal = Object.assign(new Error("Sign in to continue."), { status: 401 })
    const r = await consentPOST(post({}))
    expect([401, 403, 500]).toContain(r.status)
  })
})

describe("creating a pipeline", () => {
  it("returns the pipeline, its stages and exactly where to upload", async () => {
    const { status, body } = await made()
    expect(status).toBe(201)
    expect(body.pipeline.stages.map((s: any) => s.kind)[0]).toBe("ingest")
    expect(body.uploads.source).toContain("/incoming/source.mp4")
    expect(body.uploads.references).toHaveLength(1)
    expect(body.pipeline.consent).toMatchObject({ version: CONSENT_VERSION, voiceAltered: false })
    expect(JSON.stringify(body)).not.toContain("pathname")
  })
  it("refuses a different workspace key, a bad consent, and a read-only member", async () => {
    state.principal = me()
    expect(
      (
        await consentPOST(
          post({
            scopeKey: "org:two",
            statementVersion: CONSENT_VERSION,
            attest,
            subjects: "abc",
            sourceSha256: sha("a"),
            referenceSha256: [sha("b")],
          }),
        )
      ).status,
    ).toBe(409)
    expect(
      (
        await consentPOST(
          post({
            scopeKey: "org:one",
            statementVersion: CONSENT_VERSION,
            attest: { ...attest, noPublicFigureOrMinor: false },
            subjects: "abc",
            sourceSha256: sha("a"),
            referenceSha256: [sha("b")],
          }),
        )
      ).status,
    ).toBe(400)
    state.principal = me("u1", "org:one", { readonly: true })
    expect((await consentPOST(post({}))).status).toBe(403)
  })
})

describe("who can see a pipeline", () => {
  it("only its owner, in its workspace", async () => {
    const { body } = await made()
    const id = body.pipeline.id
    expect((await detailGET(new Request("https://anker.example/x"), ctx(id))).status).toBe(200)
    for (const other of [me("u2"), me("u1", "org:two")]) {
      state.principal = other
      expect((await detailGET(new Request("https://anker.example/x"), ctx(id))).status).toBe(404)
      expect(
        (await artifactGET(new Request("https://anker.example/x"), ctx(id, { kind: "source" }))).status,
      ).toBe(404)
      expect((await runPOST(post({}), ctx(id))).status).toBe(404)
    }
  })
  it("lists only the caller's own", async () => {
    await made(me("u1"))
    await made(me("u2"))
    state.principal = me("u1")
    const r = await listGET(new Request("https://anker.example/x?scopeKey=org:one"))
    expect((await r.json()).pipelines).toHaveLength(1)
  })
  it("serves only known file kinds", async () => {
    const { body } = await made()
    expect(
      (
        await artifactGET(
          new Request("https://anker.example/x"),
          ctx(body.pipeline.id, { kind: "../../etc/passwd" }),
        )
      ).status,
    ).toBe(404)
    expect(
      (await artifactGET(new Request("https://anker.example/x"), ctx(body.pipeline.id, { kind: "source" })))
        .status,
    ).toBe(404)
  })
})

describe("the review route", () => {
  it("refuses a decision before the earlier steps are done and one on stale files", async () => {
    const { body } = await made()
    const id = body.pipeline.id
    const early = await reviewPOST(
      post({ scopeKey: "org:one", gate: "input", approved: true, expectedHash: sha("c") }),
      ctx(id),
    )
    expect(early.status).toBe(409)
    await db.query("UPDATE ai_studio_stages SET status='done' WHERE pipeline_id=$1 AND ord<2", [id])
    const detail = await (await detailGET(new Request("https://anker.example/x"), ctx(id))).json()
    expect(detail.gates.input.ready).toBe(true)
    expect(
      (
        await reviewPOST(
          post({ scopeKey: "org:one", gate: "input", approved: true, expectedHash: sha("c") }),
          ctx(id),
        )
      ).status,
    ).toBe(409)
    const ok = await reviewPOST(
      post({ scopeKey: "org:one", gate: "input", approved: true, expectedHash: detail.gates.input.hash }),
      ctx(id),
    )
    expect(ok.status).toBe(200)
    expect((await ok.json()).pipeline.stages[2].status).toBe("done")
  })
  it("rejects malformed bodies", async () => {
    const { body } = await made()
    expect(
      (
        await reviewPOST(
          post({ scopeKey: "org:one", gate: "other", approved: true, expectedHash: sha("c") }),
          ctx(body.pipeline.id),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await reviewPOST(
          post({ scopeKey: "org:one", gate: "input", approved: true, expectedHash: "x", extra: 1 }),
          ctx(body.pipeline.id),
        )
      ).status,
    ).toBe(400)
  })
})

describe("uploads go straight to Blob, for exact names only", () => {
  const p = me()
  const id = randomUUID()
  const at = (name: string) => pipelinePath(p.userId, p.scopeKey, id, name)
  it("allows the source and up to four references, with their own limits", () => {
    expect(uploadRule(p, id, at("incoming/source.mp4"))).toMatchObject({
      contentTypes: ["video/mp4"],
      maxBytes: 100 * 1024 * 1024,
    })
    expect(uploadRule(p, id, at("incoming/reference-1.png"))?.contentTypes).toContain("image/png")
    expect(uploadRule(p, id, at("incoming/reference-4.webp"))).toBeTruthy()
  })
  it("refuses everything else: other names, another pipeline, another person, path tricks", () => {
    for (const name of [
      "incoming/reference-5.png",
      "incoming/source.mov",
      "source.mp4",
      "incoming/../source.mp4",
      "incoming/reference-1.svg",
      "incoming/source.mp4/x",
    ])
      expect(uploadRule(p, id, at(name)), name).toBeNull()
    expect(
      uploadRule(p, id, pipelinePath(p.userId, p.scopeKey, randomUUID(), "incoming/source.mp4")),
    ).toBeNull()
    expect(uploadRule(me("u2"), id, at("incoming/source.mp4"))).toBeNull()
    expect(uploadRule(p, id, "ai-studio/other/source.mp4")).toBeNull()
  })
  it("the upload route makes a token only for the caller's own pipeline", async () => {
    const { body } = await made()
    vi.mocked(handleUpload).mockImplementationOnce(async (o: any) => {
      const mine = body.uploads.source as string
      await expect(
        o.onBeforeGenerateToken(mine, JSON.stringify({ pipelineId: body.pipeline.id }), false),
      ).resolves.toMatchObject({ allowedContentTypes: ["video/mp4"], addRandomSuffix: false })
      await expect(
        o.onBeforeGenerateToken(
          "ai-studio-pipelines/x/y/incoming/source.mp4",
          JSON.stringify({ pipelineId: body.pipeline.id }),
          false,
        ),
      ).rejects.toThrow()
      await expect(
        o.onBeforeGenerateToken(mine, JSON.stringify({ pipelineId: randomUUID() }), false),
      ).rejects.toThrow()
      return { type: "blob.generate-client-token", clientToken: "t" } as any
    })
    expect((await uploadPOST(post({ type: "blob.generate-client-token" }))).status).toBe(200)
    expect(handleUpload).toHaveBeenCalledOnce()
  })
  it("refuses a request from another origin", async () => {
    expect((await uploadPOST(post({}, "https://evil.example"))).status).toBe(403)
  })
})

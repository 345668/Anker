import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
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
vi.mock("@/lib/entitlements", () => ({
  assertAllowed: vi.fn(async () => {}),
  assertWithinLimit: vi.fn(async () => {}),
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/ai/runtime-config", () => ({ readRouterConfig: async () => null }))
vi.mock("./provider", async (orig) => ({
  ...(await orig<typeof import("./provider")>()),
  submitGeneration: vi.fn(),
  generationStatus: vi.fn(),
}))
vi.mock("@vercel/blob", () => ({ put: vi.fn(async () => ({})), get: vi.fn(async () => null) }))
vi.mock("@/lib/net/safe-fetch", () => ({
  safeFetch: vi.fn(async () => ({
    body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
    contentType: "image/png",
    finalUrl: "https://cdn.example/image.png",
  })),
}))
import { sql } from "@/lib/db"
import { assertAllowed } from "@/lib/entitlements"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { inputSchema, type GenerationInput } from "./catalog"
import { ProviderError, submitGeneration, generationStatus } from "./provider"
import { createJob, getJob, listJobs, advanceJob, assertScope } from "./service"
import { ownedAsset, hash } from "./assets"
import { put } from "@vercel/blob"
import { safeFetch } from "@/lib/net/safe-fetch"
import { POST, GET } from "@/app/api/anker/studio/route"
import { GET as sourceGET } from "@/app/api/anker/studio/source/route"
import { GET as assetGET } from "@/app/api/anker/studio/assets/[id]/route"
let db: PGlite
const principal = (
  userId = "u1",
  scopeKey = "org:one",
  persona: AiPrincipal["persona"] = "founder",
): AiPrincipal => ({
  userId,
  scopeKey,
  orgId: scopeKey.startsWith("org:") ? scopeKey.slice(4) : null,
  persona,
  membership: null,
  lpMemberships: [],
  canWrite: persona !== "lp",
  readonly: false,
  allowedTools: null,
})
const input = (extra: Partial<GenerationInput> = {}): GenerationInput =>
  inputSchema.parse({
    scopeKey: "org:one",
    requestKey: randomUUID(),
    model: "qwen-image-2.0",
    prompt: "Editorial cover",
    aspectRatio: "1:1",
    resolution: "standard",
    ...extra,
  })
beforeAll(async () => {
  db = new PGlite()
  state.query = async (q: string, v: unknown[]) => (await db.query(q, v)).rows
  await db.exec(readFileSync("scripts/migrations/2026-10-07b-ai-media-studio.sql", "utf8"))
}, 30000)
beforeEach(async () => {
  await db.exec("TRUNCATE ai_studio_jobs,ai_studio_assets,ai_studio_scope_locks CASCADE")
  vi.clearAllMocks()
  vi.stubEnv("DASHSCOPE_API_KEY", "sk-test")
  vi.stubEnv("MEDIA_BLOB_READ_WRITE_TOKEN", "test")
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://anker.example")
  state.principal = principal()
  vi.mocked(submitGeneration).mockResolvedValue("provider-1")
  vi.mocked(generationStatus).mockResolvedValue({
    status: "completed",
    image: "https://cdn.example/image.png",
    video: null,
  })
  vi.mocked(put).mockResolvedValue({} as any)
})
afterAll(async () => {
  await db.close()
  vi.unstubAllEnvs()
})
it("deduplicates concurrent same-key requests", async () => {
  const body = input(),
    jobs = await Promise.all([createJob(principal(), body), createJob(principal(), body)])
  expect(jobs[0].id).toBe(jobs[1].id)
  expect(submitGeneration).toHaveBeenCalledTimes(1)
})
it("rejects changed input with the same key", async () => {
  const body = input()
  await createJob(principal(), body)
  await expect(createJob(principal(), { ...body, prompt: "Changed" })).rejects.toMatchObject({ status: 409 })
  expect(submitGeneration).toHaveBeenCalledTimes(1)
})
it("isolates other users and other workspaces", async () => {
  const j = await createJob(principal(), input())
  for (const p of [principal("u2"), principal("u1", "org:two")]) {
    expect(await listJobs(p)).toEqual([])
    await expect(getJob(p, j.id, true)).rejects.toMatchObject({ status: 404 })
  }
  expect(generationStatus).not.toHaveBeenCalled()
})
it("rejects stale scopes and readonly principals", async () => {
  expect(() => assertScope(principal(), "org:two", true)).toThrow(/Workspace changed/)
  await expect(createJob({ ...principal(), canWrite: false }, input())).rejects.toMatchObject({ status: 403 })
  await expect(
    createJob({ ...principal("lp", "lp:lp", "lp"), readonly: true }, input({ scopeKey: "lp:lp" })),
  ).rejects.toMatchObject({ status: 403 })
  expect(submitGeneration).not.toHaveBeenCalled()
})
it("allows all personas without granting LP fund-write access", async () => {
  for (const [persona, scope] of [
    ["founder", "org:one"],
    ["vc", "org:two"],
    ["lp", "lp:user"],
  ] as const) {
    const p = principal("user", scope, persona)
    expect((await createJob(p, input({ scopeKey: scope }))).status).toBe("queued")
    if (persona === "lp") expect(p.canWrite).toBe(false)
  }
})
it("checks entitlements before spending", async () => {
  vi.mocked(assertAllowed).mockRejectedValueOnce(new WorkspaceError("Paused", 403))
  await expect(createJob(principal(), input())).rejects.toMatchObject({ status: 403 })
  expect(submitGeneration).not.toHaveBeenCalled()
})
it("caps active requests in the database under concurrent reservations", async () => {
  const r = await Promise.allSettled(Array.from({ length: 5 }, () => createJob(principal(), input())))
  expect(r.filter((v) => v.status === "fulfilled")).toHaveLength(3)
  expect(r.filter((v) => v.status === "rejected")).toHaveLength(2)
  expect(submitGeneration).toHaveBeenCalledTimes(3)
})
it("counts failed requests toward quota but permits replays", async () => {
  const first = input()
  await createJob(principal(), first)
  await db.exec("UPDATE ai_studio_jobs SET status='failed'")
  for (let i = 0; i < 19; i++) {
    await createJob(principal(), input())
    await db.exec("UPDATE ai_studio_jobs SET status='failed'")
  }
  await expect(createJob(principal(), input())).rejects.toMatchObject({ status: 429 })
  expect((await createJob(principal(), first)).status).toBe("failed")
  expect(submitGeneration).toHaveBeenCalledTimes(20)
})
it("fails closed when configuration is missing", async () => {
  vi.stubEnv("DASHSCOPE_API_KEY", ""); vi.stubEnv("QWEN_API_KEY", "")
  await expect(createJob(principal(), input())).rejects.toMatchObject({ status: 503 })
  expect(submitGeneration).not.toHaveBeenCalled()
  expect(await listJobs(principal())).toHaveLength(0)
})
it("never retries an ambiguous submission", async () => {
  vi.mocked(submitGeneration).mockRejectedValueOnce(new Error("Timeout"))
  const body = input(),
    j = await createJob(principal(), body)
  expect(j.status).toBe("uncertain")
  await createJob(principal(), body)
  await getJob(principal(), j.id, true)
  expect(submitGeneration).toHaveBeenCalledTimes(1)
})
it("records explicit provider refusal", async () => {
  vi.mocked(submitGeneration).mockRejectedValueOnce(new ProviderError(429, "Provider allowance exhausted."))
  const j = await createJob(principal(), input())
  expect(j.status).toBe("failed")
  expect(j.error).toMatch(/allowance/)
})
it("saves privately before ready, leasing competing polls", async () => {
  const j = await createJob(principal(), input())
  await Promise.all([advanceJob(j.id), advanceJob(j.id)])
  const saved = await getJob(principal(), j.id)
  expect(saved.status).toBe("completed")
  expect(saved.assets[0].url).toBe(`/api/anker/studio/assets/${j.id}`)
  expect(put).toHaveBeenCalledTimes(1)
  expect(vi.mocked(put).mock.calls[0][2]).toMatchObject({ access: "private" })
  await expect(ownedAsset(principal("u2"), j.id)).rejects.toMatchObject({ status: 404 })
})
it("retries saving without generating twice", async () => {
  vi.mocked(put).mockRejectedValueOnce(new Error("storage down"))
  const j = await createJob(principal(), input())
  await advanceJob(j.id)
  expect((await getJob(principal(), j.id)).status).toBe("saving")
  await db.exec("UPDATE ai_studio_jobs SET next_poll_at=now()")
  await advanceJob(j.id)
  expect((await getJob(principal(), j.id)).status).toBe("completed")
  expect(submitGeneration).toHaveBeenCalledTimes(1)
})
it("finishes already-saved outputs without contacting provider", async () => {
  const j = await createJob(principal(), input())
  await advanceJob(j.id)
  await db.exec("UPDATE ai_studio_jobs SET status='saving',next_poll_at=now()")
  vi.mocked(generationStatus).mockClear()
  await advanceJob(j.id)
  expect((await getJob(principal(), j.id)).status).toBe("completed")
  expect(generationStatus).not.toHaveBeenCalled()
})
it("never exposes provider URLs or ownership internals", async () => {
  const j = await createJob(principal(), input())
  await advanceJob(j.id)
  const h = JSON.stringify(await listJobs(principal()))
  for (const s of ["cdn.example", "provider-1", "pathname", "user_id", "test:secret"])
    expect(h).not.toContain(s)
})
it("handles moderation blocks and missing output", async () => {
  for (const [status, expected] of [
    ["nsfw", "blocked"],
    ["completed", "failed"],
  ]) {
    vi.mocked(generationStatus).mockResolvedValueOnce({ status, image: null, video: null })
    const j = await createJob(principal(), input())
    await advanceJob(j.id)
    expect((await getJob(principal(), j.id)).status).toBe(expected)
  }
  expect(put).not.toHaveBeenCalled()
})
it("expires interrupted and long-running jobs without reposting", async () => {
  const j = await createJob(principal(), input())
  await sql`UPDATE ai_studio_jobs SET status='submitting',created_at=now()-interval '3 minutes' WHERE id=${j.id}`
  expect((await getJob(principal(), j.id, true)).status).toBe("uncertain")
  await sql`UPDATE ai_studio_jobs SET status='queued',created_at=now()-interval '3 hours',next_poll_at=now() WHERE id=${j.id}`
  await advanceJob(j.id)
  expect((await getJob(principal(), j.id)).status).toBe("failed")
  expect(submitGeneration).toHaveBeenCalledTimes(1)
})
it("rejects another user's start frame", async () => {
  const id = randomUUID()
  await sql`INSERT INTO ai_studio_assets(id,user_id,scope_key,kind,pathname,filename,content_type,bytes) VALUES(${id},'other','org:one','image','private/a','a.png','image/png',20)`
  await expect(
    createJob(principal(), input({ model: "wan2.7", resolution: "720p", duration: 5, sourceAssetId: id })),
  ).rejects.toMatchObject({ status: 404 })
  expect(submitGeneration).not.toHaveBeenCalled()
})
it("shares only an expiring source capability", async () => {
  const id = randomUUID()
  await sql`INSERT INTO ai_studio_assets(id,user_id,scope_key,kind,pathname,filename,content_type,bytes) VALUES(${id},'u1','org:one','image','private/a','a.png','image/png',20)`
  await createJob(principal(), input({ model: "wan2.7", resolution: "720p", duration: 5, sourceAssetId: id }))
  const url = vi.mocked(submitGeneration).mock.calls[0][1]!
  expect(url).toMatch(/^https:\/\/anker.example\/api\/anker\/studio\/source\?token=[a-f0-9]{64}$/)
  const [r] = await sql`SELECT source_token_hash FROM ai_studio_jobs`
  expect(r.source_token_hash).toBe(hash(new URL(url).searchParams.get("token")!))
  await db.exec("UPDATE ai_studio_jobs SET created_at=now()-interval '3 hours'")
  expect((await sourceGET(new Request(url))).status).toBe(404)
})
it("saves video output as a private MP4", async () => {
  vi.mocked(generationStatus).mockResolvedValueOnce({
    status: "completed",
    image: null,
    video: "https://cdn.example/video.mp4",
  })
  vi.mocked(safeFetch).mockResolvedValueOnce({
    body: Buffer.from("0000ftypisom0000"),
    contentType: "video/mp4",
    finalUrl: "https://cdn.example/video.mp4",
  })
  const j = await createJob(principal(), input({ model: "wan2.7", resolution: "720p", duration: 5 }))
  await advanceJob(j.id)
  const saved = await getJob(principal(), j.id)
  expect(saved.status).toBe("completed")
  expect(saved.assets[0].kind).toBe("video")
  expect(saved.assets[0].name).toMatch(/\.mp4$/)
})
const req = (body: unknown) =>
  new Request("https://anker.example/api/anker/studio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
it("requires sign-in", async () => {
  state.principal = new WorkspaceError("Sign in", 401)
  expect((await POST(req(input()))).status).toBe(401)
})
it("rejects invalid models, settings and unknown fields", async () => {
  for (const extra of [{ provider: "evil" }, { model: "../admin" }, { duration: 100 }, { resolution: "16k" }])
    expect((await POST(req({ ...input(), ...extra }))).status).toBe(400)
  expect(submitGeneration).not.toHaveBeenCalled()
})
it("requires displayed scope for list and create", async () => {
  expect((await GET(new Request("https://anker.example/api/anker/studio?scopeKey=org:two"))).status).toBe(409)
  expect((await POST(req(input({ scopeKey: "org:two" })))).status).toBe(409)
})
it("bounds streamed input and rejects cross-origin mutations", async () => {
  expect((await POST(req({ ...input(), prompt: "x".repeat(25000) }))).status).toBe(413)
  const r = req(input())
  r.headers.set("origin", "https://foreign.example")
  expect((await POST(r)).status).toBe(403)
})
it("refuses another user's download", async () => {
  const j = await createJob(principal(), input())
  await advanceJob(j.id)
  state.principal = principal("u2")
  expect(
    (
      await assetGET(new Request(`https://anker.example/api/anker/studio/assets/${j.id}`), {
        params: Promise.resolve({ id: j.id }),
      })
    ).status,
  ).toBe(404)
})

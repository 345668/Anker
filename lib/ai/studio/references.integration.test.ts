import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
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
vi.mock("@/lib/entitlements", () => ({
  assertAllowed: vi.fn(async () => {}),
  assertWithinLimit: vi.fn(async () => {}),
  getEffective: vi.fn(async () => ({ limits: { ai_studio_daily_credits: null } })),
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/ai/runtime-config", () => ({ readRouterConfig: async () => null }))
vi.mock("./provider", async (orig) => ({
  ...(await orig<typeof import("./provider")>()),
  submitGeneration: vi.fn(async () => "img:https://oss.example/out.png"),
  generationStatus: vi.fn(),
}))
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async () => ({})),
  get: vi.fn(async () => ({ statusCode: 200, stream: new Response("PNGDATA").body })),
}))
vi.mock("@/lib/net/safe-fetch", () => ({ safeFetch: vi.fn() }))

import { inputSchema } from "./catalog"
import { createJob } from "./service"
import { submitGeneration } from "./provider"
import { GET as sourceGET } from "@/app/api/anker/studio/source/route"

let db: PGlite
const me = (userId = "u1"): AiPrincipal => ({
  userId,
  scopeKey: "org:one",
  orgId: "one",
  persona: "founder",
  membership: null,
  lpMemberships: [],
  canWrite: true,
  readonly: false,
  allowedTools: null,
})
const asset = async (kind: "image" | "audio" = "image", user = "u1", scope = "org:one") => {
  const id = randomUUID()
  await db.query(
    "INSERT INTO ai_studio_assets(id,user_id,scope_key,kind,pathname,filename,content_type,bytes) VALUES($1,$2,$3,$4,'p/x','x.png','image/png',10)",
    [id, user, scope, kind],
  )
  return id
}
const input = (extra: object = {}) =>
  inputSchema.parse({
    scopeKey: "org:one",
    requestKey: randomUUID(),
    model: "qwen-image-edit-plus-2025-12-15",
    prompt: "Use the pose of image 1 and the colours of image 2",
    aspectRatio: "1:1",
    resolution: "standard",
    ...extra,
  })

beforeAll(async () => {
  db = new PGlite()
  state.query = async (q: string, v: unknown[]) => (await db.query(q, v)).rows
  await db.exec(
    "CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text)",
  )
  await db.exec("CREATE TABLE plan_catalog (plan text PRIMARY KEY, limits jsonb)")
  for (const f of [
    "2026-10-07b-ai-media-studio",
    "2026-10-09-ai-media-studio-v2",
    "2026-10-10-ai-media-studio-comfy",
    "2026-10-14-ai-studio-credits",
  ])
    await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
}, 30000)
afterAll(() => db.close())
beforeEach(async () => {
  await db.exec(
    "TRUNCATE ai_studio_jobs,ai_studio_assets,ai_studio_scope_locks,ai_studio_credit_ledger CASCADE",
  )
  vi.clearAllMocks()
  vi.mocked(submitGeneration).mockResolvedValue("img:https://oss.example/out.png")
  vi.stubEnv("DASHSCOPE_API_KEY", "sk-test")
  vi.stubEnv("MEDIA_BLOB_READ_WRITE_TOKEN", "test")
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://anker.example")
})

it("sends one link per reference, all under one job token, and charges the edit price", async () => {
  const ids = [await asset(), await asset(), await asset()]
  const j = await createJob(me(), input({ referenceAssetIds: ids }))
  expect(j.status).toBe("queued")
  const call = vi.mocked(submitGeneration).mock.calls[0]
  const urls = call[3]!.referenceUrls!
  expect(urls).toHaveLength(3)
  const tokens = new Set(urls.map((u) => new URL(u).searchParams.get("token")))
  expect(tokens.size).toBe(1)
  expect(urls.map((u) => new URL(u).searchParams.get("asset"))).toEqual(ids)
  expect(call[1]).toBeUndefined() // no single source image
  const [row] = (await db.query("SELECT source_token_hash FROM ai_studio_jobs WHERE id=$1", [j.id]))
    .rows as any[]
  expect(row.source_token_hash).toMatch(/^[a-f0-9]{64}$/)
  expect(
    (
      (await db.query("SELECT sum(credits)::int n FROM ai_studio_credit_ledger WHERE kind='spend'"))
        .rows[0] as any
    ).n,
  ).toBe(-40)
})

it("refuses a file that is not the caller's image, before anything is sent or charged", async () => {
  const mine = await asset()
  const theirs = await asset("image", "u2")
  const otherScope = await asset("image", "u1", "org:two")
  const audio = await asset("audio")
  for (const bad of [theirs, otherScope])
    await expect(createJob(me(), input({ referenceAssetIds: [mine, bad] }))).rejects.toMatchObject({
      status: 404,
    })
  await expect(createJob(me(), input({ referenceAssetIds: [mine, audio] }))).rejects.toMatchObject({
    status: 400,
  })
  expect(submitGeneration).not.toHaveBeenCalled()
  expect(((await db.query("SELECT count(*)::int n FROM ai_studio_credit_ledger")).rows[0] as any).n).toBe(0)
})

it("the link route serves exactly the assets the job lists, nothing else", async () => {
  const [a, b] = [await asset(), await asset()]
  const stray = await asset() // the same person's image, not attached to this job
  await createJob(me(), input({ referenceAssetIds: [a, b] }))
  const urls = vi.mocked(submitGeneration).mock.calls[0][3]!.referenceUrls!
  const token = new URL(urls[0]).searchParams.get("token")!
  const link = (asset: string | null) =>
    new Request(
      `https://anker.example/api/anker/studio/source?token=${token}${asset ? `&asset=${asset}` : ""}`,
    )
  expect((await sourceGET(new Request(urls[0]))).status).toBe(200)
  expect((await sourceGET(new Request(urls[1]))).status).toBe(200)
  expect((await sourceGET(link(stray))).status).toBe(404) // not listed
  expect((await sourceGET(link(null))).status).toBe(404) // a reference-only job has no single source
  expect((await sourceGET(link("not-an-id"))).status).toBe(404)
  expect(
    (
      await sourceGET(
        new Request(`https://anker.example/api/anker/studio/source?token=${"0".repeat(64)}&asset=${a}`),
      )
    ).status,
  ).toBe(404)
})

it("an image to edit still works the old way", async () => {
  const one = await asset()
  const j = await createJob(me(), input({ sourceAssetId: one }))
  expect(j.status).toBe("queued")
  const call = vi.mocked(submitGeneration).mock.calls[0]
  expect(call[1]).toMatch(/source\?token=[a-f0-9]{64}$/)
  expect(call[3]!.referenceUrls).toBeUndefined()
  const link = new Request(call[1]!)
  expect((await sourceGET(link)).status).toBe(200)
})

it("the same references with the same request key are one job, charged once", async () => {
  const ids = [await asset(), await asset()]
  const body = input({ referenceAssetIds: ids })
  await createJob(me(), body)
  await createJob(me(), body)
  expect(submitGeneration).toHaveBeenCalledTimes(1)
  expect(
    (
      (await db.query("SELECT count(*)::int n FROM ai_studio_credit_ledger WHERE kind='spend'"))
        .rows[0] as any
    ).n,
  ).toBe(1)
})

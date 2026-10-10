import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import type { AiPrincipal } from "@/lib/assistant/context"
const state = vi.hoisted(() => ({
  query: null as any,
  principal: null as any,
}))
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
vi.mock("@/lib/ai/runtime-config", () => ({
  readRouterConfig: async () => null,
}))
vi.mock("./provider", async (orig) => ({
  ...(await orig<typeof import("./provider")>()),
  submitGeneration: vi.fn(),
  generationStatus: vi.fn(),
}))
vi.mock("@vercel/blob", () => ({
  put: vi.fn(async () => ({})),
  get: vi.fn(async () => null),
}))
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
import { createJob, getJob, listJobs, advanceJob, assertScope, reconcileComfy } from "./service"
import { RECIPES, recipeFor } from "./comfy/recipes"
import { _resetComfyFlagCache } from "./comfy/client"
import { ownedAsset, hash } from "./assets"
import { createSpeech, speechSchema, MAX_TRACK_MS } from "./speech"
import { wavBytes } from "./wav"
import { get, put } from "@vercel/blob"
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
  await db.exec(
    "CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text)",
  )
  for (const f of [
    "2026-10-07b-ai-media-studio",
    "2026-10-09-ai-media-studio-v2",
    "2026-10-10-ai-media-studio-comfy",
  ])
    await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
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
  await expect(createJob(principal(), input())).rejects.toMatchObject({
    status: 403,
  })
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
  await expect(createJob(principal(), input())).rejects.toMatchObject({
    status: 429,
  })
  expect((await createJob(principal(), first)).status).toBe("failed")
  expect(submitGeneration).toHaveBeenCalledTimes(20)
})
it("fails closed when configuration is missing", async () => {
  vi.stubEnv("DASHSCOPE_API_KEY", "")
  vi.stubEnv("QWEN_API_KEY", "")
  await expect(createJob(principal(), input())).rejects.toMatchObject({
    status: 503,
  })
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
  await expect(ownedAsset(principal("u2"), j.id)).rejects.toMatchObject({
    status: 404,
  })
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
    vi.mocked(generationStatus).mockResolvedValueOnce({
      status,
      image: null,
      video: null,
    })
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
    createJob(
      principal(),
      input({
        model: "wan2.7",
        resolution: "720p",
        duration: 5,
        sourceAssetId: id,
      }),
    ),
  ).rejects.toMatchObject({ status: 404 })
  expect(submitGeneration).not.toHaveBeenCalled()
})
it("shares only an expiring source capability", async () => {
  const id = randomUUID()
  await sql`INSERT INTO ai_studio_assets(id,user_id,scope_key,kind,pathname,filename,content_type,bytes) VALUES(${id},'u1','org:one','image','private/a','a.png','image/png',20)`
  await createJob(
    principal(),
    input({
      model: "wan2.7",
      resolution: "720p",
      duration: 5,
      sourceAssetId: id,
    }),
  )
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

const tone = (ms: number) => ({
  sampleRate: 24000,
  channels: 1,
  pcm: Buffer.alloc(Math.round((24000 * ms) / 1000) * 2, 1),
})
const speak = (lines: Array<{ voice?: string; text: string; pauseMs?: number }>) =>
  speechSchema.parse({ scopeKey: "org:one", lines: lines.map((l) => ({ voice: "Cherry", ...l })) })
function tts(wavs: Buffer[]) {
  const f = vi
    .fn()
    .mockImplementation(async () =>
      Response.json({ output: { audio: { url: "https://cdn.example/line.wav" } } }),
    )
  vi.stubGlobal("fetch", f)
  for (const w of wavs)
    vi.mocked(safeFetch).mockResolvedValueOnce({
      body: w,
      contentType: "audio/wav",
      finalUrl: "https://cdn.example/line.wav",
    } as never)
  return f
}
it("speaks dialogue into one private voice track with the pause between speakers", async () => {
  const f = tts([wavBytes(tone(1500)), wavBytes(tone(2000))])
  const { asset: a, timeline } = await createSpeech(
    principal(),
    speak([
      { voice: "Ethan", text: "Walk us through your retention." },
      { text: "A hundred twenty-eight percent.", pauseMs: 0 },
    ]),
  )
  expect(a).toMatchObject({ kind: "audio", durationMs: 1500 + 450 + 2000 })
  expect(timeline).toEqual([
    { startMs: 0, endMs: 1500 },
    { startMs: 1950, endMs: 3950 },
  ])
  expect(f).toHaveBeenCalledTimes(2)
  expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
    model: "qwen3-tts-flash",
    input: { text: "Walk us through your retention.", voice: "Ethan", language_type: "English" },
  })
  expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer sk-test")
  const row = await ownedAsset({ userId: "u1", scopeKey: "org:one" }, a.id)
  expect(row).toMatchObject({ kind: "audio", content_type: "audio/wav", job_id: null })
  expect(vi.mocked(put).mock.calls.at(-1)?.[2]).toMatchObject({ access: "private", contentType: "audio/wav" })
})
it("fetches a speech result link given as http on DashScope's own storage host over https", async () => {
  const f = vi.fn().mockImplementation(async () =>
    Response.json({
      output: {
        audio: { data: "", url: "http://dashscope-result-sgp.oss-ap-southeast-1.aliyuncs.com/a.wav" },
      },
    }),
  )
  vi.stubGlobal("fetch", f)
  vi.mocked(safeFetch).mockResolvedValueOnce({
    body: wavBytes(tone(2500)),
    contentType: "audio/wav",
    finalUrl: "x",
  } as never)
  await createSpeech(principal(), speak([{ text: "Hello there." }]))
  expect(vi.mocked(safeFetch).mock.calls.at(-1)?.[0]).toBe(
    "https://dashscope-result-sgp.oss-ap-southeast-1.aliyuncs.com/a.wav",
  )
})
it("pads a very short line to the two seconds a video voice track needs, and refuses a track over thirty", async () => {
  tts([wavBytes(tone(600))])
  expect((await createSpeech(principal(), speak([{ text: "Yes." }]))).asset).toMatchObject({
    durationMs: 2000,
  })
  tts(Array.from({ length: 4 }, () => wavBytes(tone(9000))))
  await expect(
    createSpeech(principal(), speak(Array.from({ length: 4 }, () => ({ text: "A long answer." })))),
  ).rejects.toMatchObject({ status: 400 })
  expect(MAX_TRACK_MS).toBe(30000)
})
it("limits the lines, their length, the voices and the scope", async () => {
  for (const bad of [
    { lines: [] },
    { lines: Array.from({ length: 9 }, () => ({ voice: "Cherry", text: "x" })) },
    { lines: [{ voice: "Cherry", text: "x".repeat(301) }] },
    { lines: [{ voice: "Nobody", text: "Hello" }] },
    { lines: [{ voice: "Cherry", text: "  " }] },
  ])
    expect(
      speechSchema.safeParse({ scopeKey: "org:one", ...bad }).success,
      JSON.stringify(bad).slice(0, 60),
    ).toBe(false)
  await expect(
    createSpeech(principal(), { ...speak([{ text: "Hello there." }]), scopeKey: "org:other" }),
  ).rejects.toMatchObject({ status: 409 })
  expect(vi.mocked(safeFetch)).not.toHaveBeenCalled()
})
it("does not speak when the provider is not set up or the day's allowance is used", async () => {
  vi.stubEnv("DASHSCOPE_API_KEY", "")
  vi.stubEnv("QWEN_API_KEY", "")
  await expect(createSpeech(principal(), speak([{ text: "Hello there." }]))).rejects.toMatchObject({
    status: 503,
  })
  vi.stubEnv("DASHSCOPE_API_KEY", "sk-test")
  for (let i = 0; i < 40; i++)
    await sql`INSERT INTO ai_studio_assets(id,user_id,scope_key,kind,pathname,filename,content_type,bytes) VALUES(${randomUUID()},'u1','org:one','audio','p','a.wav','audio/wav',10)`
  await expect(createSpeech(principal(), speak([{ text: "Hello there." }]))).rejects.toMatchObject({
    status: 429,
  })
})
it("passes a voice track to the provider through a private, expiring link, and only for the job that owns it", async () => {
  const id = randomUUID()
  await sql`INSERT INTO ai_studio_assets(id,user_id,scope_key,kind,pathname,filename,content_type,bytes,duration_ms) VALUES(${id},'u1','org:one','audio','private/v.wav','v.wav','audio/wav',200,5000)`
  const j = await createJob(
    principal(),
    input({ model: "wan2.7", resolution: "720p", duration: 5, audioAssetId: id }),
  )
  const audioUrl = vi.mocked(submitGeneration).mock.calls[0][2]!
  expect(audioUrl).toMatch(
    /^https:\/\/anker\.example\/api\/anker\/studio\/source\?token=[a-f0-9]{64}&kind=audio$/,
  )
  const [row] = await sql`SELECT audio_asset_id, audio_token_hash FROM ai_studio_jobs WHERE id=${j.id}`
  expect(row.audio_asset_id).toBe(id)
  const token = new URL(audioUrl).searchParams.get("token")!
  expect(row.audio_token_hash).toBe(hash(token))
  vi.mocked(get).mockResolvedValueOnce({ statusCode: 200, stream: new Response("RIFF").body } as never)
  expect((await sourceGET(new Request(audioUrl))).status).toBe(200)
  // the same token is not a start-frame link, and a wrong token is nothing
  expect((await sourceGET(new Request(audioUrl.replace("&kind=audio", "")))).status).toBe(404)
  expect((await sourceGET(new Request(audioUrl.replace(token.slice(0, 4), "0000")))).status).toBe(404)
})
it("refuses someone else's voice track, and an image offered as a voice track", async () => {
  const other = randomUUID(),
    img = randomUUID()
  await sql`INSERT INTO ai_studio_assets(id,user_id,scope_key,kind,pathname,filename,content_type,bytes,duration_ms) VALUES(${other},'other','org:one','audio','p','v.wav','audio/wav',200,5000)`
  await sql`INSERT INTO ai_studio_assets(id,user_id,scope_key,kind,pathname,filename,content_type,bytes) VALUES(${img},'u1','org:one','image','p','a.png','image/png',20)`
  const v = { model: "wan2.7", resolution: "720p", duration: 5 } as const
  await expect(createJob(principal(), input({ ...v, audioAssetId: other }))).rejects.toMatchObject({
    status: 404,
  })
  await expect(createJob(principal(), input({ ...v, audioAssetId: img }))).rejects.toMatchObject({
    status: 400,
  })
  expect(submitGeneration).not.toHaveBeenCalled()
})

// ── self-hosted ComfyUI (docs/architecture/49) ───────────────────────────────────────────────────────────────────────────────────────────
const cardRecipe = () => ({
  ...recipeFor("smoke.card")!,
  id: "test.card",
  internal: false,
  freeText: false,
  ratios: ["16:9"],
  sizes: { "16:9": [512, 288] as [number, number] },
})
const comfyFlag = (on: boolean) =>
  db
    .exec(`UPDATE platform_flags SET enabled=${on} WHERE key='ai_studio_comfy'`)
    .then(() => _resetComfyFlagCache())
const comfyInput = () => input({ model: "test.card", resolution: "standard", aspectRatio: "16:9" })
beforeEach(() => {
  RECIPES.push(cardRecipe())
  vi.stubEnv("COMFY_BASE_URL", "https://gw.example")
  vi.stubEnv("COMFY_API_KEY", "gk")
})
afterEach(() => {
  RECIPES.splice(
    RECIPES.findIndex((r) => r.id === "test.card"),
    1,
  )
  _resetComfyFlagCache()
})
it("the migration adds the self-hosted columns and an off switch", async () => {
  expect((await db.query("SELECT enabled FROM platform_flags WHERE key='ai_studio_comfy'")).rows[0]).toEqual({
    enabled: false,
  })
  const cols = (
    await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='ai_studio_jobs' AND column_name IN ('provider','recipe_id','recipe_version')",
    )
  ).rows
  expect(cols).toHaveLength(3)
})
it("a self-hosted model is refused while the platform switch is off, or the gateway is not configured, and nothing is submitted", async () => {
  await comfyFlag(false)
  await expect(createJob(principal(), comfyInput())).rejects.toMatchObject({ status: 503 })
  await comfyFlag(true)
  vi.stubEnv("COMFY_API_KEY", "")
  await expect(createJob(principal(), comfyInput())).rejects.toMatchObject({ status: 503 })
  expect(submitGeneration).not.toHaveBeenCalled()
  expect((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM ai_studio_jobs")).rows[0].n).toBe(0)
})
it("with the switch on, a self-hosted job records its recipe, uses its own id as the worker's job id, and needs no hosted-provider setup", async () => {
  await comfyFlag(true)
  vi.stubEnv("DASHSCOPE_API_KEY", "")
  vi.stubEnv("QWEN_API_KEY", "")
  vi.mocked(submitGeneration).mockImplementationOnce(async (_v, _s, _a, ctx) => `comfy:${ctx?.jobId}`)
  const j = await createJob(principal(), comfyInput())
  expect(vi.mocked(submitGeneration).mock.calls[0][3]).toMatchObject({ jobId: j.id })
  const [row] =
    await sql`SELECT provider, recipe_id, recipe_version, provider_id, status FROM ai_studio_jobs WHERE id=${j.id}`
  expect(row).toMatchObject({
    provider: "comfy",
    recipe_id: "test.card",
    recipe_version: 1,
    provider_id: `comfy:${j.id}`,
    status: "queued",
  })
})
it("a refused prompt is recorded as blocked, and a refused setting as failed", async () => {
  await comfyFlag(true)
  vi.mocked(submitGeneration).mockRejectedValueOnce(
    new ProviderError(422, "The provider blocked this prompt or media. Revise it before trying again."),
  )
  expect(await createJob(principal(), comfyInput())).toMatchObject({ status: "blocked" })
  vi.mocked(submitGeneration).mockRejectedValueOnce(
    new ProviderError(400, "The image worker refused these settings."),
  )
  expect(
    await createJob(
      principal(),
      input({ model: "test.card", resolution: "standard", aspectRatio: "16:9", prompt: "Another" }),
    ),
  ).toMatchObject({ status: "failed" })
})
it("a self-hosted result arrives as bytes and is saved privately without a public link", async () => {
  await comfyFlag(true)
  vi.mocked(submitGeneration).mockImplementationOnce(async (_v, _s, _a, ctx) => `comfy:${ctx?.jobId}`)
  const j = await createJob(principal(), comfyInput())
  vi.mocked(generationStatus).mockResolvedValueOnce({
    status: "completed",
    image: null,
    video: null,
    file: { bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]), kind: "image" },
  })
  await advanceJob(j.id)
  expect(generationStatus).toHaveBeenCalledWith(`comfy:${j.id}`, "test.card")
  expect(safeFetch).not.toHaveBeenCalled()
  expect((await getJob(principal(), j.id)).status).toBe("completed")
  expect(vi.mocked(put).mock.calls.at(-1)?.[2]).toMatchObject({ access: "private", contentType: "image/png" })
})
it("an unconfirmed submit is settled by asking the worker: found means queued, missing for five minutes means it never arrived", async () => {
  await comfyFlag(true)
  vi.mocked(submitGeneration).mockRejectedValueOnce(new Error("timeout"))
  const j = await createJob(principal(), comfyInput())
  expect(j.status).toBe("uncertain")
  expect(j.error).toMatch(/check the worker/)
  const worker = (code: number, body: object) =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => Response.json(body, { status: code })),
    )
  worker(404, {})
  await reconcileComfy(j.id)
  expect((await getJob(principal(), j.id)).status).toBe("uncertain") // too soon to say
  await db.exec("UPDATE ai_studio_jobs SET created_at=now()-interval '6 minutes'")
  await reconcileComfy(j.id)
  expect(await getJob(principal(), j.id)).toMatchObject({
    status: "failed",
    error: expect.stringMatching(/nothing ran and nothing is owed/),
  })
  vi.mocked(submitGeneration).mockRejectedValueOnce(new Error("timeout"))
  const k = await createJob(
    principal(),
    input({ model: "test.card", resolution: "standard", aspectRatio: "16:9", prompt: "Second try" }),
  )
  worker(200, { id: k.id, status: "in_progress" })
  await reconcileComfy(k.id)
  const [row] = await sql`SELECT status, provider_id FROM ai_studio_jobs WHERE id=${k.id}`
  expect(row).toEqual({ status: "queued", provider_id: `comfy:${k.id}` })
})
it("hosted jobs are untouched: provider defaults to dashscope and reconcile ignores them", async () => {
  const j = await createJob(principal(), input())
  expect((await sql`SELECT provider, recipe_id FROM ai_studio_jobs WHERE id=${j.id}`)[0]).toEqual({
    provider: "dashscope",
    recipe_id: null,
  })
  vi.stubGlobal("fetch", vi.fn())
  await reconcileComfy(j.id)
  expect(fetch).not.toHaveBeenCalled()
})

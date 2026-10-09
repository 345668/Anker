import { afterEach, beforeEach, expect, it, vi } from "vitest"
const cfg = vi.hoisted(() => ({ v: null as null | Record<string, string> }))
vi.mock("@/lib/ai/runtime-config", () => ({
  readRouterConfig: async () => cfg.v,
}))
import { inputSchema, mapInput, MODELS } from "./catalog"
import { submitGeneration, generationStatus, configuration } from "./provider"
import { mediaFormat } from "./assets"
const base = {
  scopeKey: "lp:user",
  requestKey: "fba68a16-5607-4c7d-a2ce-270e7a8a8c17",
  prompt: "A silver sculpture",
  model: "qwen-image-2.0",
  aspectRatio: "1:1",
  resolution: "standard",
}
beforeEach(() => {
  cfg.v = null
  vi.stubEnv("DASHSCOPE_API_KEY", "sk-test")
  vi.stubEnv("MEDIA_BLOB_READ_WRITE_TOKEN", "private-token")
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
it("maps a Qwen image to the DashScope size", () => {
  expect(mapInput(inputSchema.parse(base))).toEqual({
    kind: "image",
    model: "qwen-image-2.0",
    prompt: base.prompt,
    size: "1328*1328",
    promptExtend: false,
  })
  expect(mapInput(inputSchema.parse({ ...base, aspectRatio: "16:9", enhancePrompt: true }))).toMatchObject({
    size: "1664*928",
    promptExtend: true,
  })
})
it("maps Wan 2.7 text-to-video and image-to-video", () => {
  const v = inputSchema.parse({
    ...base,
    model: "wan2.7",
    resolution: "720p",
    aspectRatio: "16:9",
    duration: 5,
  })
  expect(mapInput(v)).toEqual({
    kind: "video",
    model: "wan2.7-t2v",
    prompt: base.prompt,
    resolution: "720P",
    ratio: "16:9",
    duration: 5,
    promptExtend: false,
  })
  expect(mapInput(v, "https://anker.example/source")).toMatchObject({
    model: "wan2.7-i2v",
    firstFrame: "https://anker.example/source",
  })
})
it("refuses unsupported settings", () => {
  for (const v of [
    { audio: true },
    { model: "wan2.7", resolution: "720p", duration: 1 },
    { model: "wan2.7", resolution: "720p", duration: 16 },
    { sourceAssetId: crypto.randomUUID() },
    { model: "wan2.7", duration: 5, resolution: "4k" },
    { model: "nonexistent" },
  ])
    expect(inputSchema.safeParse({ ...base, ...v }).success).toBe(false)
})
it("submits an image synchronously and keeps the credential server-side", async () => {
  const f = vi.fn().mockResolvedValueOnce(
    Response.json({
      output: {
        choices: [{ message: { content: [{ image: "https://oss.example/a.png" }] } }],
      },
    }),
  )
  vi.stubGlobal("fetch", f)
  const ref = await submitGeneration(inputSchema.parse(base))
  expect(ref).toBe("img:https://oss.example/a.png")
  expect(f.mock.calls[0][0]).toBe(
    "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
  )
  expect(f.mock.calls[0][1]).toMatchObject({
    redirect: "error",
    headers: { Authorization: "Bearer sk-test" },
  })
  expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({
    model: "qwen-image-2.0",
    parameters: { size: "1328*1328", n: 1 },
  })
  expect(await generationStatus(ref)).toEqual({
    status: "completed",
    image: "https://oss.example/a.png",
    video: null,
  })
})
it("submits video as an async task and polls it", async () => {
  const f = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ output: { task_id: "t/1", task_status: "PENDING" } }))
    .mockResolvedValueOnce(Response.json({ output: { task_status: "RUNNING" } }))
    .mockResolvedValueOnce(
      Response.json({
        output: {
          task_status: "SUCCEEDED",
          video_url: "https://oss.example/v.mp4",
        },
      }),
    )
  vi.stubGlobal("fetch", f)
  const ref = await submitGeneration(
    inputSchema.parse({
      ...base,
      model: "wan2.7",
      resolution: "720p",
      duration: 5,
    }),
  )
  expect(ref).toBe("task:t/1")
  expect(f.mock.calls[0][1].headers).toMatchObject({
    "X-DashScope-Async": "enable",
  })
  expect((await generationStatus(ref)).status).toBe("running")
  expect(await generationStatus(ref)).toMatchObject({
    status: "completed",
    video: "https://oss.example/v.mp4",
  })
  expect(f.mock.calls[1][0]).toBe("https://dashscope-intl.aliyuncs.com/api/v1/tasks/t%2F1")
})
it("maps moderation failures to blocked and never relays raw provider errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce(
      Response.json({
        output: {
          task_status: "FAILED",
          code: "DataInspectionFailed",
          message: "key=secret",
        },
      }),
    ),
  )
  expect((await generationStatus("task:x")).status).toBe("nsfw")
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("key=secret prompt=private", { status: 401 })),
  )
  await expect(submitGeneration(inputSchema.parse(base))).rejects.toThrow(/credentials/)
  await expect(submitGeneration(inputSchema.parse(base))).rejects.not.toThrow(/key=secret/)
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ code: "DataInspectionFailed", message: "inappropriate content" }, { status: 400 }),
      ),
  )
  await expect(submitGeneration(inputSchema.parse(base))).rejects.toMatchObject({ status: 422 })
})
it("treats a missing image, missing task id and invalid JSON as ambiguous failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ output: {} }))
      .mockResolvedValueOnce(Response.json({ output: {} }))
      .mockResolvedValueOnce(new Response("not json")),
  )
  await expect(submitGeneration(inputSchema.parse(base))).rejects.toMatchObject({ status: 502 })
  await expect(
    submitGeneration(
      inputSchema.parse({
        ...base,
        model: "wan2.7",
        resolution: "720p",
        duration: 5,
      }),
    ),
  ).rejects.toMatchObject({ status: 502 })
  await expect(submitGeneration(inputSchema.parse(base))).rejects.toMatchObject({ status: 502 })
})
it("is ready only with a DashScope key and the private Blob token", async () => {
  expect((await configuration()).ready).toBe(true)
  vi.stubEnv("MEDIA_BLOB_READ_WRITE_TOKEN", "")
  expect((await configuration()).ready).toBe(false)
  vi.stubEnv("MEDIA_BLOB_READ_WRITE_TOKEN", "t")
  vi.stubEnv("DASHSCOPE_API_KEY", "")
  vi.stubEnv("QWEN_API_KEY", "")
  expect((await configuration()).ready).toBe(false)
})
it("uses the free-tier key first and never the token-plan key", async () => {
  vi.stubEnv("DASHSCOPE_API_KEY", "")
  vi.stubEnv("QWEN_API_KEY", "")
  cfg.v = { qwenFreeApiKey: "sk-free", qwenPlanApiKey: "sk-sp-plan" }
  const f = vi.fn().mockResolvedValue(
    Response.json({
      output: {
        choices: [{ message: { content: [{ image: "https://oss.example/a.png" }] } }],
      },
    }),
  )
  vi.stubGlobal("fetch", f)
  await submitGeneration(inputSchema.parse(base))
  expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer sk-free")
  expect(f.mock.calls[0][0]).toMatch(/^https:\/\/dashscope-intl\.aliyuncs\.com\/api\/v1\//)
  cfg.v = { qwenPlanApiKey: "sk-sp-plan" } // only a plan key: not usable for media
  expect((await configuration()).ready).toBe(false)
  cfg.v = { qwenApiKey: "sk-std" }
  expect((await configuration()).ready).toBe(true)
})
it("recognizes media signatures and refuses SVG", () => {
  expect(mediaFormat(Buffer.from('<svg onload="alert(1)"></svg>'))).toBeNull()
  expect(mediaFormat(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]))?.type).toBe("image/png")
  expect(mediaFormat(Buffer.from("0000ftypisom0000"))?.type).toBe("video/mp4")
})
it("offers every Qwen Cloud image and video model, each with the sizes or limits it needs", () => {
  const ids = MODELS.map((m) => m.id)
  expect(ids).toEqual(
    expect.arrayContaining([
      "qwen-image-2.0",
      "qwen-image-2.0-pro",
      "qwen-image-max",
      "qwen-image-plus",
      "z-image-turbo",
      "wan2.6-t2i",
      "wan2.7-image-pro",
      "wan2.7",
      "happyhorse-1.1",
    ]),
  )
  for (const m of MODELS) {
    if (m.kind === "image" && !m.needsSource)
      for (const r of m.ratios) expect(m.sizes?.[r], `${m.id} ${r}`).toMatch(/^\d+\*\d+$/)
    if (m.kind === "video") expect(m.max).toBeGreaterThanOrEqual(m.min)
  }
})
it("takes a voice track, a seed and a negative prompt only where the model does", () => {
  const wan = { ...base, model: "wan2.7", resolution: "720p", duration: 6 }
  const audioAssetId = crypto.randomUUID()
  expect(inputSchema.safeParse({ ...wan, audioAssetId, seed: 7, negativePrompt: "blurry" }).success).toBe(
    true,
  )
  for (const bad of [
    { ...wan, model: "happyhorse-1.1", audioAssetId },
    { ...wan, model: "happyhorse-1.1", seed: 3 },
    { ...base, audioAssetId },
    { ...base, seed: 3 },
    { ...wan, seed: -1 },
    { ...wan, negativePrompt: "x".repeat(501) },
    { ...wan, model: "happyhorse-1.1", duration: 2 },
    { ...wan, model: "happyhorse-1.1", aspectRatio: "1:1" },
  ])
    expect(inputSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
})
it("the edit models need an image to edit, and other image models refuse one", () => {
  const edit = { ...base, model: "qwen-image-edit-max" }
  expect(inputSchema.safeParse(edit).success).toBe(false)
  expect(inputSchema.safeParse({ ...edit, sourceAssetId: crypto.randomUUID() }).success).toBe(true)
  expect(inputSchema.safeParse({ ...base, sourceAssetId: crypto.randomUUID() }).success).toBe(false)
  const m = mapInput(
    inputSchema.parse({ ...edit, sourceAssetId: crypto.randomUUID() }),
    "https://anker.example/s",
  )
  expect(m).toMatchObject({
    kind: "image",
    model: "qwen-image-edit-max",
    sourceImage: "https://anker.example/s",
  })
  expect((m as { size?: string }).size).toBeUndefined()
})
it("sends the voice track as audio_url for text-to-video and as driving_audio for image-to-video", async () => {
  const f = vi.fn().mockImplementation(async () => Response.json({ output: { task_id: "t1" } }))
  vi.stubGlobal("fetch", f)
  const v = inputSchema.parse({
    ...base,
    model: "wan2.7",
    resolution: "720p",
    duration: 10,
    seed: 5,
    negativePrompt: "blurry",
    audioAssetId: crypto.randomUUID(),
  })
  await submitGeneration(v, undefined, "https://anker.example/voice")
  expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({
    model: "wan2.7-t2v",
    input: { prompt: base.prompt, negative_prompt: "blurry", audio_url: "https://anker.example/voice" },
    parameters: { resolution: "720P", ratio: "1:1", duration: 10, seed: 5, watermark: false },
  })
  await submitGeneration(v, "https://anker.example/frame", "https://anker.example/voice")
  const i2v = JSON.parse(f.mock.calls[1][1].body)
  expect(i2v.model).toBe("wan2.7-i2v")
  expect(i2v.input.media).toEqual([
    { type: "first_frame", url: "https://anker.example/frame" },
    { type: "driving_audio", url: "https://anker.example/voice" },
  ])
  expect(i2v.input.audio_url).toBeUndefined()
})
it("maps HappyHorse without a ratio or a voice track", async () => {
  const f = vi.fn().mockResolvedValue(Response.json({ output: { task_id: "t2" } }))
  vi.stubGlobal("fetch", f)
  await submitGeneration(
    inputSchema.parse({
      ...base,
      model: "happyhorse-1.1",
      aspectRatio: "16:9",
      resolution: "1080p",
      duration: 5,
    }),
  )
  const b = JSON.parse(f.mock.calls[0][1].body)
  expect(b).toMatchObject({ model: "happyhorse-1.1-t2v", parameters: { resolution: "1080P", duration: 5 } })
  expect(b.parameters.ratio).toBeUndefined()
})

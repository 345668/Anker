import { afterEach, beforeEach, expect, it, vi } from "vitest"
vi.mock("@/lib/ai/runtime-config", () => ({ readRouterConfig: async () => null }))
import { inputSchema, mapInput } from "./catalog"
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
  vi.stubEnv("DASHSCOPE_API_KEY", "sk-test")
  vi.stubEnv("MEDIA_BLOB_READ_WRITE_TOKEN", "private-token")
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
it("maps a Qwen image to the DashScope size", () => {
  expect(mapInput(inputSchema.parse(base))).toEqual({ kind: "image", model: "qwen-image-2.0", prompt: base.prompt, size: "1328*1328", promptExtend: false })
  expect(mapInput(inputSchema.parse({ ...base, aspectRatio: "16:9", enhancePrompt: true }))).toMatchObject({ size: "1664*928", promptExtend: true })
})
it("maps Wan 2.7 text-to-video and image-to-video", () => {
  const v = inputSchema.parse({ ...base, model: "wan2.7", resolution: "720p", aspectRatio: "16:9", duration: 5 })
  expect(mapInput(v)).toEqual({ kind: "video", model: "wan2.7-t2v", prompt: base.prompt, resolution: "720P", ratio: "16:9", duration: 5, promptExtend: false })
  expect(mapInput(v, "https://anker.example/source")).toMatchObject({ model: "wan2.7-i2v", firstFrame: "https://anker.example/source" })
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
  const f = vi.fn().mockResolvedValueOnce(Response.json({ output: { choices: [{ message: { content: [{ image: "https://oss.example/a.png" }] } }] } }))
  vi.stubGlobal("fetch", f)
  const ref = await submitGeneration(inputSchema.parse(base))
  expect(ref).toBe("img:https://oss.example/a.png")
  expect(f.mock.calls[0][0]).toBe("https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation")
  expect(f.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer sk-test" } })
  expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({ model: "qwen-image-2.0", parameters: { size: "1328*1328", n: 1 } })
  expect(await generationStatus(ref)).toEqual({ status: "completed", image: "https://oss.example/a.png", video: null })
})
it("submits video as an async task and polls it", async () => {
  const f = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ output: { task_id: "t/1", task_status: "PENDING" } }))
    .mockResolvedValueOnce(Response.json({ output: { task_status: "RUNNING" } }))
    .mockResolvedValueOnce(Response.json({ output: { task_status: "SUCCEEDED", video_url: "https://oss.example/v.mp4" } }))
  vi.stubGlobal("fetch", f)
  const ref = await submitGeneration(inputSchema.parse({ ...base, model: "wan2.7", resolution: "720p", duration: 5 }))
  expect(ref).toBe("task:t/1")
  expect(f.mock.calls[0][1].headers).toMatchObject({ "X-DashScope-Async": "enable" })
  expect((await generationStatus(ref)).status).toBe("running")
  expect(await generationStatus(ref)).toMatchObject({ status: "completed", video: "https://oss.example/v.mp4" })
  expect(f.mock.calls[1][0]).toBe("https://dashscope-intl.aliyuncs.com/api/v1/tasks/t%2F1")
})
it("maps moderation failures to blocked and never relays raw provider errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ output: { task_status: "FAILED", code: "DataInspectionFailed", message: "key=secret" } })))
  expect((await generationStatus("task:x")).status).toBe("nsfw")
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("key=secret prompt=private", { status: 401 })))
  await expect(submitGeneration(inputSchema.parse(base))).rejects.toThrow(/credentials/)
  await expect(submitGeneration(inputSchema.parse(base))).rejects.not.toThrow(/key=secret/)
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "DataInspectionFailed", message: "inappropriate content" }, { status: 400 })))
  await expect(submitGeneration(inputSchema.parse(base))).rejects.toMatchObject({ status: 422 })
})
it("treats a missing image, missing task id and invalid JSON as ambiguous failures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ output: {} })).mockResolvedValueOnce(Response.json({ output: {} })).mockResolvedValueOnce(new Response("not json")))
  await expect(submitGeneration(inputSchema.parse(base))).rejects.toMatchObject({ status: 502 })
  await expect(submitGeneration(inputSchema.parse({ ...base, model: "wan2.7", resolution: "720p", duration: 5 }))).rejects.toMatchObject({ status: 502 })
  await expect(submitGeneration(inputSchema.parse(base))).rejects.toMatchObject({ status: 502 })
})
it("is ready only with a DashScope key and the private Blob token", async () => {
  expect((await configuration()).ready).toBe(true)
  vi.stubEnv("MEDIA_BLOB_READ_WRITE_TOKEN", "")
  expect((await configuration()).ready).toBe(false)
  vi.stubEnv("MEDIA_BLOB_READ_WRITE_TOKEN", "t"); vi.stubEnv("DASHSCOPE_API_KEY", ""); vi.stubEnv("QWEN_API_KEY", "")
  expect((await configuration()).ready).toBe(false)
})
it("recognizes media signatures and refuses SVG", () => {
  expect(mediaFormat(Buffer.from('<svg onload="alert(1)"></svg>'))).toBeNull()
  expect(mediaFormat(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]))?.type).toBe("image/png")
  expect(mediaFormat(Buffer.from("0000ftypisom0000"))?.type).toBe("video/mp4")
})

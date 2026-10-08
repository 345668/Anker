import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { inputSchema, mapInput } from "./catalog"
import { submitGeneration, generationStatus, configuration } from "./provider"
import { mediaFormat } from "./assets"
const base = {
  scopeKey: "lp:user",
  requestKey: "fba68a16-5607-4c7d-a2ce-270e7a8a8c17",
  prompt: "A silver sculpture",
  model: "soul-2",
  aspectRatio: "1:1",
  resolution: "720p",
}
beforeEach(() => {
  vi.stubEnv("HF_API_BASE_URL", "https://provider.example")
  vi.stubEnv("HF_API_KEY", "id:secret")
  vi.stubEnv("MEDIA_BLOB_READ_WRITE_TOKEN", "private-token")
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
it("maps Soul with one output", () => {
  expect(mapInput(inputSchema.parse(base))).toEqual({
    path: "higgsfield-ai/soul/v2/standard",
    body: {
      prompt: base.prompt,
      resolution: "720p",
      aspect_ratio: "1:1",
      batch_size: 1,
      enhance_prompt: false,
    },
  })
})
it("maps image-to-video and model-specific audio", () => {
  const k = inputSchema.parse({ ...base, model: "kling-3-turbo", duration: 5 })
  expect(mapInput(k, "https://anker.example/source")).toEqual({
    path: "kling-video/v3.0-turbo/image-to-video",
    body: { prompt: base.prompt, resolution: "720p", duration: 5, image_url: "https://anker.example/source" },
  })
  expect(
    mapInput(inputSchema.parse({ ...base, model: "seedance-2-fast", duration: 8, audio: true })).body,
  ).toMatchObject({ generate_audio: true, duration: 8, aspect_ratio: "1:1" })
})
it("refuses unsupported settings", () => {
  for (const v of [
    { audio: true },
    { model: "kling-3-turbo", duration: 1 },
    { sourceAssetId: crypto.randomUUID() },
    { model: "seedance-2-fast", duration: 5, resolution: "4k" },
  ])
    expect(inputSchema.safeParse({ ...base, ...v }).success).toBe(false)
})
it("keeps credentials server-side and encodes IDs", async () => {
  const f = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ request_id: "q/1" }))
    .mockResolvedValueOnce(
      Response.json({ status: "completed", video: { url: "https://cdn.example/video.mp4" } }),
    )
  vi.stubGlobal("fetch", f)
  expect(await submitGeneration(inputSchema.parse(base))).toBe("q/1")
  expect(f.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { Authorization: "Key id:secret" } })
  expect((await generationStatus("q/1")).video).toBe("https://cdn.example/video.mp4")
  expect(f.mock.calls[1][0]).toBe("https://provider.example/requests/q%2F1/status")
})
it("does not relay raw provider errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("key=secret prompt=private", { status: 401 })),
  )
  await expect(submitGeneration(inputSchema.parse(base))).rejects.toThrow(/credentials/)
  await expect(submitGeneration(inputSchema.parse(base))).rejects.not.toThrow(/key=secret/)
})
it("treats missing IDs and invalid JSON as ambiguous failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: "queued" }))
      .mockResolvedValueOnce(new Response("not json")),
  )
  await expect(submitGeneration(inputSchema.parse(base))).rejects.toMatchObject({ status: 502 })
  await expect(submitGeneration(inputSchema.parse(base))).rejects.toMatchObject({ status: 502 })
})
it("rejects insecure or credential-bearing origins", () => {
  for (const u of [
    "http://provider.example",
    "https://user:pass@provider.example",
    "https://provider.example?key=secret",
  ]) {
    vi.stubEnv("HF_API_BASE_URL", u)
    expect(configuration().ready).toBe(false)
  }
})
it("recognizes media signatures and refuses SVG", () => {
  expect(mediaFormat(Buffer.from('<svg onload="alert(1)"></svg>'))).toBeNull()
  expect(mediaFormat(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]))?.type).toBe("image/png")
  expect(mediaFormat(Buffer.from("0000ftypisom0000"))?.type).toBe("video/mp4")
})

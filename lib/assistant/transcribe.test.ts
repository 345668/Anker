import { describe, it, expect, vi, afterEach } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/ai/qwen-standard", () => ({ standardQwen: vi.fn(async () => ({ apiKey: "std-key", baseUrl: "https://qwen.test/compatible-mode/v1" })) }))
import { transcribeAudio } from "./transcribe"

afterEach(() => vi.unstubAllGlobals())

describe("transcribeAudio", () => {
  it("sends the audio as an input_audio data URL on the standard lane and returns the text", async () => {
    let seen: any
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      seen = { url, auth: init.headers.Authorization, body: JSON.parse(init.body) }
      return new Response(JSON.stringify({ choices: [{ message: { content: " Hello team. " } }] }), { status: 200 })
    }))
    const text = await transcribeAudio(Buffer.from("abc"), "memo.mp3")
    expect(text).toBe("Hello team.")
    expect(seen.url).toBe("https://qwen.test/compatible-mode/v1/chat/completions")
    expect(seen.auth).toBe("Bearer std-key")
    expect(seen.body.model).toBe("qwen3-asr-flash")
    expect(seen.body.messages[0].content[0].input_audio.data).toBe(`data:audio/mpeg;base64,${Buffer.from("abc").toString("base64")}`)
  })
  it("refuses over-long audio and unknown formats without calling the provider", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f)
    await expect(transcribeAudio(Buffer.alloc(8 * 1024 * 1024), "x.wav")).rejects.toMatchObject({ status: 413 })
    await expect(transcribeAudio(Buffer.from("x"), "x.xyz")).rejects.toMatchObject({ status: 400 })
    expect(f).not.toHaveBeenCalled()
  })
  it("maps a provider auth failure to a safe message, not provider text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("secret provider detail", { status: 401 })))
    await expect(transcribeAudio(Buffer.from("a"), "a.wav")).rejects.toThrow(/rejected its credentials/)
  })
})

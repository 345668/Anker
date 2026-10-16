import { describe, it, expect, vi, beforeEach } from "vitest"
const m = vi.hoisted(() => ({ calls: [] as any[] }))
vi.mock("@/lib/metering", () => ({ meter: async (i: any) => { m.calls.push(i) }, guessAudioSeconds: (b: number) => Math.max(1, Math.round(b / 12_000)) }))
vi.mock("@/lib/ai/qwen-standard", () => ({ standardQwen: async () => ({ baseUrl: "https://q.test", apiKey: "k" }) }))
import { transcribeAudio } from "./transcribe"

beforeEach(() => { m.calls.length = 0 })
const ok = (text: string) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 }))

describe("transcribeAudio is metered", () => {
  it("with the caller's measured seconds and workspace", async () => {
    const f = ok("hello"); await transcribeAudio(Buffer.alloc(1000), "a.ogg", undefined, { owner: "o1", seconds: 42, source: "telegram-voice" }); f.mockRestore()
    expect(m.calls).toEqual([{ unit: "asr_second", qty: 42, estimated: false, source: "telegram-voice", owner: "o1" }])
  })
  it("with a guess from the file size when the length is not known", async () => {
    const f = ok("hello"); await transcribeAudio(Buffer.alloc(120_000), "a.mp3"); f.mockRestore()
    expect(m.calls[0]).toMatchObject({ unit: "asr_second", qty: 10, estimated: true, source: "transcribe" })
  })
  it("nothing is metered when no speech was recognised or the service failed", async () => {
    let f = ok(""); await expect(transcribeAudio(Buffer.alloc(1000), "a.mp3")).rejects.toThrow(); f.mockRestore()
    f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("no", { status: 500 })); await expect(transcribeAudio(Buffer.alloc(1000), "a.mp3")).rejects.toThrow(); f.mockRestore()
    expect(m.calls).toHaveLength(0)
  })
})

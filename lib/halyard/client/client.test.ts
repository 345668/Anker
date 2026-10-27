import { describe, expect, it } from "vitest"
import { encodeWav, pcmMs } from "./wav"
import { createSseParser } from "./sse"
import { createUploadQueue, type QueuedUtterance, type UploadOutcome } from "./upload-queue"

describe("wav", () => {
  it("writes a valid 16 kHz mono header and the samples", () => {
    const pcm = new Uint8Array([1, 0, 2, 0, 3, 0]), w = encodeWav(pcm), v = new DataView(w.buffer)
    expect(String.fromCharCode(...w.slice(0, 4))).toBe("RIFF"); expect(String.fromCharCode(...w.slice(8, 12))).toBe("WAVE")
    expect(v.getUint32(24, true)).toBe(16000); expect(v.getUint16(22, true)).toBe(1); expect(v.getUint16(34, true)).toBe(16); expect(v.getUint32(40, true)).toBe(6); expect(v.getUint32(4, true)).toBe(42)
    expect([...w.slice(44)]).toEqual([1, 0, 2, 0, 3, 0]); expect(pcmMs(32000)).toBe(1000)
  })
})
describe("sse parser", () => {
  it("handles events split across chunks, CRLF, and a malformed one", () => {
    const got: any[] = []; const p = createSseParser((e, d) => got.push([e, d]))
    p('event: suggestion\ndata: {"text":"he'); p('llo"}\n\nevent: done\r\ndata: {"ok":true}\r\n\r\nevent: x\ndata: {bad\n\n')
    expect(got).toEqual([["suggestion", { text: "hello" }], ["done", { ok: true }]])
  })
})
describe("upload queue", () => {
  const u = (seq: number, ms = 1000): QueuedUtterance => ({ seq, startedMs: seq * ms, endedMs: seq * ms + ms, wav: new Uint8Array(4), channel: "room" })
  const noSleep = async () => {}
  it("sends in order, retries transient failures with a growing delay, and acknowledges once", async () => {
    const sent: number[] = [], acks: number[] = [], delays: number[] = []; let fail = 2
    const q = createUploadQueue({ send: async (x): Promise<UploadOutcome> => { sent.push(x.seq); if (x.seq === 1 && fail-- > 0) return { ok: false, status: 503, message: "down" }; return { ok: true, body: {} } }, onAck: (x) => acks.push(x.seq), sleep: async (ms) => { delays.push(ms) } })
    q.push(u(0)); q.push(u(1)); q.push(u(2)); await q.flush()
    expect(acks).toEqual([0, 1, 2]); expect(sent).toEqual([0, 1, 1, 1, 2]); expect(delays).toEqual([500, 1000])
  })
  it("drops a permanent refusal and says why, and keeps going", async () => {
    const drops: string[] = [], acks: number[] = []
    const q = createUploadQueue({ send: async (x) => (x.seq === 0 ? { ok: false, status: 402, message: "allowance used" } : { ok: true, body: {} }), onDrop: (_x, why, m) => drops.push(why + ":" + m), onAck: (x) => acks.push(x.seq), sleep: noSleep })
    q.push(u(0)); q.push(u(1)); await q.flush(); expect(drops).toEqual(["refused:allowance used"]); expect(acks).toEqual([1])
  })
  it("treats a thrown network error as transient and holds at most the audio cap, dropping the oldest waiting", async () => {
    const drops: number[] = []; let up = false, n = 0
    const q = createUploadQueue({ send: async () => { if (!up && n++ > 3) up = true; if (!up) throw new Error("offline"); return { ok: true, body: {} } }, onDrop: (x, why) => why === "overflow" && drops.push(x.seq), sleep: noSleep, maxQueuedMs: 3000 })
    for (let i = 0; i < 6; i++) q.push(u(i)); await q.flush()
    expect(drops.length).toBeGreaterThan(0); expect(drops).not.toContain(0)   // the one being sent is never the one dropped
  })
})

import { expect, it } from "vitest"
import { durationMs, joinWavs, parseWav, wavBytes } from "./wav"
const tone = (ms: number, rate = 24000) => ({
  sampleRate: rate,
  channels: 1,
  pcm: Buffer.alloc(Math.round((rate * ms) / 1000) * 2, 1),
})
it("round-trips a WAV and reports its length", () => {
  const w = parseWav(wavBytes(tone(1500)))
  expect(w).toMatchObject({ sampleRate: 24000, channels: 1 })
  expect(durationMs(w)).toBe(1500)
})
it("joins lines with a pause between speakers and pads a short track", () => {
  const j = joinWavs([tone(1000), tone(1500)], [500], 0)
  expect(durationMs(j)).toBe(3000)
  expect(durationMs(joinWavs([tone(500)], [], 2000))).toBe(2000)
  expect(durationMs(joinWavs([tone(1000), tone(1000)], [0], 0))).toBe(2000)
})
it("refuses clips in different formats and non-PCM audio", () => {
  expect(() => joinWavs([tone(500), tone(500, 16000)], [100])).toThrow(/different audio formats/)
  const b = wavBytes(tone(500))
  b.writeUInt16LE(3, 20)
  expect(() => parseWav(b)).toThrow(/16-bit PCM/)
  expect(() =>
    parseWav(Buffer.from("not a wav file at all, certainly not one......................")),
  ).toThrow(/Not a WAV/)
})
it("reads a streamed WAV whose data size is not filled in", () => {
  const b = wavBytes(tone(1000))
  b.writeUInt32LE(0xffffffff, 40)
  expect(durationMs(parseWav(b))).toBe(1000)
})

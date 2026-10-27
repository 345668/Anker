// @vitest-environment node
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { UtteranceSegmenter } from "../core/utterance-segmenter"
import { encodeWav } from "./wav"

/** Loads public/halyard/capture-worklet.js with a stand-in for the AudioWorklet globals and feeds it a synthetic microphone. */
function loadWorklet(sampleRate: number) {
  const posted: ArrayBuffer[] = []
  let Cls: any
  class AudioWorkletProcessor { port = { postMessage: (b: ArrayBuffer) => posted.push(b) } }
  new Function("AudioWorkletProcessor", "registerProcessor", "sampleRate", readFileSync("public/halyard/capture-worklet.js", "utf8"))(AudioWorkletProcessor, (_n: string, c: any) => { Cls = c }, sampleRate)
  return { node: new Cls(), posted }
}
const sine = (n: number, rate: number, hz: number, amp: number, from = 0) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * (i + from)) / rate))

describe("the capture worklet", () => {
  it.each([48000, 44100, 16000])("turns %i Hz microphone audio into 30 ms frames of 16 kHz 16-bit PCM with the right pitch and level", (rate) => {
    const { node, posted } = loadWorklet(rate)
    for (let b = 0; b < Math.floor(rate / 128); b++) node.process([[sine(128, rate, 440, 0.5, b * 128)]])   // one second in 128-sample render quanta
    const samples = posted.flatMap((p) => [...new Int16Array(p)])
    expect(posted.every((p) => p.byteLength === 960)).toBe(true)
    expect(samples.length).toBeGreaterThan(15000); expect(samples.length).toBeLessThanOrEqual(16000)
    const peak = Math.max(...samples.map(Math.abs)); expect(peak).toBeGreaterThan(0.4 * 32767); expect(peak).toBeLessThan(0.55 * 32767)
    let crossings = 0; for (let i = 1; i < samples.length; i++) if (samples[i - 1] < 0 && samples[i] >= 0) crossings++
    expect(Math.abs(crossings - 440)).toBeLessThan(8)                       // 440 Hz survives the resampling
  })
  it("a silent input and a missing input are harmless", () => { const { node, posted } = loadWorklet(48000); expect(node.process([[]])).toBe(true); expect(node.process([[new Float32Array(128)]])).toBe(true); expect(posted.length).toBe(0) })
  it("worklet output feeds the shared segmenter: speech between silences becomes one WAV utterance with the pre-roll", () => {
    const { node, posted } = loadWorklet(48000), out: Uint8Array[] = []
    const seg = new UtteranceSegmenter({ channel: "room", onUtterance: (_c, pcm) => out.push(encodeWav(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.length))) })
    let at = 0; const feed = (sec: number, amp: number, hz = 300) => { for (let b = 0; b < Math.floor((sec * 48000) / 128); b++, at += 128) node.process([[amp ? sine(128, 48000, hz, amp, at) : new Float32Array(128).map(() => (Math.random() - 0.5) * 0.002)]]) }
    feed(1.5, 0); feed(1.2, 0.4); feed(1.5, 0)
    for (const p of posted) seg.push(Buffer.from(new Uint8Array(p))); seg.stop()
    expect(out).toHaveLength(1)
    const bytes = out[0].length - 44; expect(bytes / 32000).toBeGreaterThan(1.0); expect(bytes / 32000).toBeLessThan(2.4)
    expect(String.fromCharCode(...out[0].slice(0, 4))).toBe("RIFF")
  })
})

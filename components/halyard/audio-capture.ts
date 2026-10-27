"use client"
import { Buffer } from "buffer"
import { UtteranceSegmenter } from "@/lib/halyard/core/utterance-segmenter"
import { encodeWav, pcmMs } from "@/lib/halyard/client/wav"
import { browserFacts, checkBrowser } from "@/lib/halyard/client/browser-check"

// The shared core uses Node's Buffer; the browser gets the same API from the `buffer` package that Next already ships for the client.
if (typeof globalThis !== "undefined" && !(globalThis as any).Buffer) (globalThis as any).Buffer = Buffer

export interface CaptureEvents {
  onUtterance: (u: { wav: Uint8Array; startedMs: number; endedMs: number }) => void
  onSpeaking: (speaking: boolean) => void
  onLevel?: (rms: number) => void
  /** The source ended on its own (microphone unplugged, shared tab closed). Listening on the other source continues. */
  onEnded: (message: string) => void
}
export interface Capture { stop(): void; setMuted(muted: boolean): void }

/** Why the browser cannot do this, in plain words, or null when it can. */
export const browserProblem = (): string | null => (typeof window === "undefined" ? null : checkBrowser(browserFacts()).problem)

async function getStream(kind: "microphone" | "tab"): Promise<MediaStream> {
  if (kind === "microphone") {
    try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }) } catch (e: any) {
      throw new Error(e?.name === "NotAllowedError" ? "Microphone access was blocked. Allow it for this site in the browser, then try again." : e?.name === "NotFoundError" ? "No microphone was found." : "The microphone could not be started.")
    }
  }
  let s: MediaStream
  try {
    // Video is requested only because browsers require it for a tab share; it is kept as small and slow as possible and never read.
    s = await navigator.mediaDevices.getDisplayMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } as any, video: { width: { max: 320 }, height: { max: 180 }, frameRate: { max: 1 } } as any })
  } catch (e: any) { throw new Error(e?.name === "NotAllowedError" ? "Sharing was cancelled. Choose the meeting's tab and tick “Share tab audio”." : "The meeting tab could not be shared.") }
  if (!s.getAudioTracks().length) { s.getTracks().forEach((t) => t.stop()); throw new Error("No audio was shared. Choose the meeting's tab (not a window) and tick “Share tab audio”.") }
  return s
}

/**
 * One audio source to utterances: worklet (16 kHz PCM) → the shared adaptive VAD and segmenter → a WAV per utterance. Audio is never stored here; it is held only until uploaded.
 * `t0` is the session clock both sources share, so utterances from the two channels can be ordered and compared.
 */
export async function startSource(kind: "microphone" | "tab", t0: number, ev: CaptureEvents): Promise<Capture> {
  const stream = await getStream(kind)
  const ctx = new AudioContext()
  try { await ctx.audioWorklet.addModule("/halyard/capture-worklet.js") } catch { stream.getTracks().forEach((t) => t.stop()); void ctx.close(); throw new Error("The audio processor could not be loaded. Reload the page and try again.") }
  const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())), node = new AudioWorkletNode(ctx, "halyard-capture")
  let muted = false, lastLevel = 0, speechStart = 0
  const seg = new UtteranceSegmenter({
    channel: kind,
    onSpeechState: (_c, speaking) => { if (speaking) speechStart = Date.now() - t0 - 300; ev.onSpeaking(speaking) },
    onUtterance: (_c, pcm) => { const ms = pcmMs(pcm.length), start = Math.max(0, speechStart); ev.onUtterance({ wav: encodeWav(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.length)), startedMs: start, endedMs: start + ms }) },
  })
  node.port.onmessage = (m) => {
    const bytes = new Uint8Array(m.data as ArrayBuffer)
    if (ev.onLevel && Date.now() - lastLevel > 100) { lastLevel = Date.now(); const s = new Int16Array(m.data as ArrayBuffer); let a = 0; for (let i = 0; i < s.length; i++) a += s[i] * s[i]; ev.onLevel(Math.sqrt(a / s.length) / 32768) }
    if (!muted) seg.push(Buffer.from(bytes))
  }
  let stopped = false
  const ended = () => { if (!stopped) ev.onEnded(kind === "tab" ? "The shared tab was closed or sharing was stopped. Listening continues on the microphone." : "The microphone stopped (it was unplugged or taken by another app).") }
  stream.getTracks().forEach((t) => t.addEventListener("ended", ended))
  src.connect(node)          // not connected to the speakers: the tab keeps playing in its own tab
  return {
    setMuted(m) { muted = m },
    stop() { stopped = true; try { seg.stop() } catch { /* nothing buffered */ } node.port.onmessage = null; src.disconnect(); stream.getTracks().forEach((t) => t.stop()); void ctx.close() },
  }
}

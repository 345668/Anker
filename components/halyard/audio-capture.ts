"use client"
import { Buffer } from "buffer"
import { UtteranceSegmenter } from "@/lib/halyard/core/utterance-segmenter"
import { encodeWav, pcmMs } from "@/lib/halyard/client/wav"

// The shared core uses Node's Buffer; the browser gets the same API from the `buffer` package that Next already ships for the client.
if (typeof globalThis !== "undefined" && !(globalThis as any).Buffer) (globalThis as any).Buffer = Buffer

export interface CaptureEvents {
  onUtterance: (u: { wav: Uint8Array; startedMs: number; endedMs: number }) => void
  onSpeaking: (speaking: boolean) => void
  onLevel?: (rms: number) => void
  onError: (message: string) => void
}
export interface Capture { stop(): void; setMuted(muted: boolean): void }

/** Why the browser cannot do this, in plain words, or null when it can. */
export function browserProblem(): string | null {
  if (typeof window === "undefined") return null
  if (!window.isSecureContext) return "Microphone access needs a secure (https) page."
  if (!navigator.mediaDevices?.getUserMedia) return "This browser cannot use the microphone."
  if (typeof AudioWorkletNode === "undefined") return "This browser cannot process live audio. Use a recent Chrome, Edge, Firefox or Safari."
  return null
}

/** Microphone to utterances: worklet (16 kHz PCM) → the shared adaptive VAD and segmenter → a WAV per utterance. Audio is never stored; it is held only until it is uploaded. */
export async function startMicrophone(ev: CaptureEvents): Promise<Capture> {
  let stream: MediaStream
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }) } catch (e: any) {
    throw new Error(e?.name === "NotAllowedError" ? "Microphone access was blocked. Allow it for this site in the browser, then try again." : e?.name === "NotFoundError" ? "No microphone was found." : "The microphone could not be started.")
  }
  const ctx = new AudioContext()
  await ctx.audioWorklet.addModule("/halyard/capture-worklet.js")
  const src = ctx.createMediaStreamSource(stream), node = new AudioWorkletNode(ctx, "halyard-capture")
  let muted = false, elapsed = 0, startedAt = 0, lastLevel = 0
  const seg = new UtteranceSegmenter({
    channel: "room",
    onSpeechState: (_c, speaking) => { if (speaking) startedAt = Math.max(0, elapsed - 300); ev.onSpeaking(speaking) },
    onUtterance: (_c, pcm) => { const ms = pcmMs(pcm.length); ev.onUtterance({ wav: encodeWav(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.length)), startedMs: startedAt, endedMs: startedAt + ms }) },
  })
  node.port.onmessage = (m) => {
    const bytes = new Uint8Array(m.data as ArrayBuffer); elapsed += pcmMs(bytes.length)
    if (ev.onLevel && Date.now() - lastLevel > 100) { lastLevel = Date.now(); const s = new Int16Array(m.data as ArrayBuffer); let a = 0; for (let i = 0; i < s.length; i++) a += s[i] * s[i]; ev.onLevel(Math.sqrt(a / s.length) / 32768) }
    if (!muted) seg.push(Buffer.from(bytes))
  }
  stream.getAudioTracks()[0]?.addEventListener("ended", () => ev.onError("The microphone stopped (it was unplugged or taken by another app)."))
  src.connect(node)
  return {
    setMuted(m) { muted = m },
    stop() { try { seg.stop() } catch { /* nothing buffered */ } node.port.onmessage = null; src.disconnect(); stream.getTracks().forEach((t) => t.stop()); void ctx.close() },
  }
}

/** Minimal 16-bit PCM WAV reading and joining, so a dialogue of several spoken lines becomes one voice track without ffmpeg. docs/architecture/48. */
export interface Wav {
  sampleRate: number
  channels: number
  pcm: Buffer
}
export function parseWav(b: Buffer): Wav {
  if (b.length < 44 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE")
    throw new Error("Not a WAV file.")
  let o = 12,
    fmt: {
      format: number
      channels: number
      rate: number
      bits: number
    } | null = null
  while (o + 8 <= b.length) {
    const id = b.toString("ascii", o, o + 4),
      size = b.readUInt32LE(o + 4),
      body = o + 8
    if (id === "fmt ")
      fmt = {
        format: b.readUInt16LE(body),
        channels: b.readUInt16LE(body + 2),
        rate: b.readUInt32LE(body + 4),
        bits: b.readUInt16LE(body + 14),
      }
    if (id === "data") {
      if (!fmt || fmt.format !== 1 || fmt.bits !== 16) throw new Error("Only 16-bit PCM audio is supported.")
      // A streamed WAV can declare a data size of 0 or 0xFFFFFFFF: take what is there.
      const len = size === 0 || size === 0xffffffff || body + size > b.length ? b.length - body : size
      return {
        sampleRate: fmt.rate,
        channels: fmt.channels,
        pcm: b.subarray(body, body + len - (len % (2 * fmt.channels))),
      }
    }
    o = body + size + (size % 2)
  }
  throw new Error("The WAV file has no audio data.")
}
export function wavBytes(w: Wav): Buffer {
  const h = Buffer.alloc(44),
    blockAlign = 2 * w.channels
  h.write("RIFF", 0)
  h.writeUInt32LE(36 + w.pcm.length, 4)
  h.write("WAVE", 8)
  h.write("fmt ", 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(w.channels, 22)
  h.writeUInt32LE(w.sampleRate, 24)
  h.writeUInt32LE(w.sampleRate * blockAlign, 28)
  h.writeUInt16LE(blockAlign, 32)
  h.writeUInt16LE(16, 34)
  h.write("data", 36)
  h.writeUInt32LE(w.pcm.length, 40)
  return Buffer.concat([h, w.pcm])
}
export const durationMs = (w: Wav) => Math.round((w.pcm.length / (2 * w.channels) / w.sampleRate) * 1000)
const silence = (w: Pick<Wav, "sampleRate" | "channels">, ms: number) =>
  Buffer.alloc(Math.round((w.sampleRate * ms) / 1000) * 2 * w.channels)
/** Join clips in order, with `pauses[i]` ms of silence after clip i, padding the end so the track is at least `minMs` long. */
export function joinWavs(clips: Wav[], pauses: number[], minMs = 0): Wav {
  if (!clips.length) throw new Error("No audio to join.")
  const { sampleRate, channels } = clips[0]
  if (clips.some((c) => c.sampleRate !== sampleRate || c.channels !== channels))
    throw new Error("The spoken lines came back in different audio formats.")
  const parts: Buffer[] = []
  clips.forEach((c, i) => {
    parts.push(c.pcm)
    if (i < clips.length - 1) parts.push(silence(clips[0], Math.max(0, pauses[i] ?? 0)))
  })
  let out: Wav = { sampleRate, channels, pcm: Buffer.concat(parts) }
  if (durationMs(out) < minMs)
    out = {
      ...out,
      pcm: Buffer.concat([out.pcm, silence(out, minMs - durationMs(out))]),
    }
  return out
}

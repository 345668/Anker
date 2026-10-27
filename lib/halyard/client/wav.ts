/** 16-bit mono PCM to a WAV file (what the server accepts as audio/wav). Pure; used in the browser and in tests. */
export function encodeWav(pcm: Uint8Array, sampleRate = 16000): Uint8Array {
  const out = new Uint8Array(44 + pcm.length), v = new DataView(out.buffer)
  const tag = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  tag(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); tag(8, "WAVE"); tag(12, "fmt "); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  tag(36, "data"); v.setUint32(40, pcm.length, true); out.set(pcm, 44)
  return out
}
/** Duration of a PCM chunk in milliseconds. */
export const pcmMs = (bytes: number, sampleRate = 16000) => Math.round((bytes / 2 / sampleRate) * 1000)

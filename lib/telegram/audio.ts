import { Mp3Encoder } from "@breezystack/lamejs"
import { joinWavs, parseWav, type Wav } from "@/lib/ai/studio/wav"

/**
 * Spoken replies (docs/architecture/57, T4). The text-to-speech service returns WAV; Telegram plays MP3, so the WAV is encoded to MP3 here, in the server, with no program to install.
 * Pure helpers (text preparation, language guess, encoding) are separate from the one call to the speech service, so they are tested without it.
 */
export const MAX_SPOKEN_CHARS = 700, MAX_LINE = 280, MAX_LINES = 3

/** Plain speakable text from a model answer: no markdown marks, links or lists punctuation, and at most about 700 characters, cut at a sentence end. */
export function textForSpeech(answer: string): string {
  const t = answer.replace(/```[\s\S]*?```/g, " ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/https?:\/\/\S+/g, " ").replace(/[*_`#>|]+/g, "").replace(/^\s*[-•]\s+/gm, "").replace(/\s+/g, " ").trim()
  if (t.length <= MAX_SPOKEN_CHARS) return t
  const cut = t.slice(0, MAX_SPOKEN_CHARS)
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "))
  return (end > 200 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" "))).trim()
}

/** Cuts speakable text into at most three lines of at most 280 characters, at sentence or word breaks (the speech service takes short lines). */
export function speechLines(text: string): string[] {
  const out: string[] = []
  let rest = text.trim()
  while (rest && out.length < MAX_LINES) {
    if (rest.length <= MAX_LINE) { out.push(rest); rest = ""; break }
    const w = rest.slice(0, MAX_LINE)
    let cut = Math.max(w.lastIndexOf(". "), w.lastIndexOf("! "), w.lastIndexOf("? "), w.lastIndexOf("; "), w.lastIndexOf(", "))
    if (cut < MAX_LINE * 0.4) cut = w.lastIndexOf(" ")
    if (cut < MAX_LINE * 0.3) cut = MAX_LINE - 1
    out.push(rest.slice(0, cut + 1).trim()); rest = rest.slice(cut + 1).trim()
  }
  return out.filter(Boolean)
}

const WORDS: Record<string, RegExp> = {
  German: /\b(und|der|die|das|nicht|ich|ist|mit|für|wir|sie|ein|eine|auch|noch|wurde|haben|werden)\b/gi,
  French: /\b(le|la|les|des|est|une|pour|avec|nous|vous|dans|pas|que|qui|sont|cette)\b/gi,
  Spanish: /\b(el|los|las|una|para|con|por|que|está|son|nos|esta|como|pero)\b/gi,
}
/** A cheap guess of the language of a reply, so the voice speaks it properly. English unless another language clearly dominates. */
export function guessLanguage(text: string): "English" | "German" | "French" | "Spanish" | "Chinese" {
  if (/[一-鿿]/.test(text)) return "Chinese"
  const score = (re: RegExp) => (text.match(re) ?? []).length
  const eng = score(/\b(the|and|is|are|with|for|you|your|this|that|have|from|will)\b/gi)
  let best: "English" | "German" | "French" | "Spanish" = "English", top = eng
  for (const [lang, re] of Object.entries(WORDS)) { const n = score(re) + (lang === "German" ? (text.match(/[äöüß]/gi) ?? []).length : 0); if (n > top + 1) { best = lang as typeof best; top = n } }
  return best
}

/** 16-bit PCM to MP3 (mono or stereo). */
export function wavToMp3(w: Wav, kbps = 48): Buffer {
  const n = w.pcm.length / 2 / w.channels
  const left = new Int16Array(n), right = w.channels > 1 ? new Int16Array(n) : undefined
  for (let i = 0; i < n; i++) { left[i] = w.pcm.readInt16LE(i * 2 * w.channels); if (right) right[i] = w.pcm.readInt16LE(i * 2 * w.channels + 2) }
  const enc = new Mp3Encoder(w.channels > 1 ? 2 : 1, w.sampleRate, kbps)
  const chunks: Buffer[] = []
  for (let i = 0; i < n; i += 1152) {
    const out = right ? enc.encodeBuffer(left.subarray(i, i + 1152), right.subarray(i, i + 1152)) : enc.encodeBuffer(left.subarray(i, i + 1152))
    if (out.length) chunks.push(Buffer.from(out))
  }
  const tail = enc.flush(); if (tail.length) chunks.push(Buffer.from(tail))
  return Buffer.concat(chunks)
}

/** Speaks an answer: prepares the text, asks the speech service for each line, joins them with a short pause, and returns an MP3 (or null when there is nothing to say). */
export async function speakAnswer(answer: string, voice = "Cherry", speak?: (voice: string, text: string, language: string) => Promise<Wav>): Promise<{ mp3: Buffer; seconds: number } | null> {
  const text = textForSpeech(answer)
  if (text.length < 8) return null
  const say = speak ?? (await import("@/lib/ai/studio/speech")).speakLine
  const language = guessLanguage(text)
  const clips: Wav[] = []
  for (const line of speechLines(text)) clips.push(await say(voice, line, language))
  const track = joinWavs(clips, clips.map(() => 350), 0)
  return { mp3: wavToMp3(track), seconds: Math.round(track.pcm.length / 2 / track.channels / track.sampleRate) }
}
export { parseWav }

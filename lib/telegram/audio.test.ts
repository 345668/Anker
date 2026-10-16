import { describe, it, expect } from "vitest"
import { textForSpeech, speechLines, guessLanguage, wavToMp3, speakAnswer, MAX_SPOKEN_CHARS, MAX_LINE, MAX_LINES } from "./audio"
import type { Wav } from "@/lib/ai/studio/wav"

const sine = (seconds: number, rate = 24000, channels = 1): Wav => {
  const n = Math.floor(seconds * rate), pcm = Buffer.alloc(n * 2 * channels)
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), (i * channels + c) * 2)
  return { sampleRate: rate, channels, pcm }
}

describe("textForSpeech", () => {
  it("removes markdown, links and list marks so nothing odd is read aloud", () => {
    expect(textForSpeech("**Katja** wants the [deck](https://x.test/a) by `Friday`.\n- first\n- second\nSee https://x.test/z")).toBe("Katja wants the deck by Friday. first second See")
    expect(textForSpeech("Before ```code block``` after")).toBe("Before after")
  })
  it("cuts a long answer at a sentence end, within the limit", () => {
    const long = "This is a sentence about the pipeline. ".repeat(40); const t = textForSpeech(long)
    expect(t.length).toBeLessThanOrEqual(MAX_SPOKEN_CHARS); expect(t.endsWith(".")).toBe(true)
  })
  it("returns nothing for an empty answer", () => expect(textForSpeech("   ```x```  ")).toBe(""))
})
describe("speechLines", () => {
  it("keeps short text as one line and splits long text into at most three lines of 280 characters", () => {
    expect(speechLines("Short.")).toEqual(["Short."])
    const lines = speechLines("Word ".repeat(300)); expect(lines.length).toBeLessThanOrEqual(MAX_LINES); for (const l of lines) expect(l.length).toBeLessThanOrEqual(MAX_LINE)
  })
  it("prefers a sentence break", () => {
    const s = `${"a".repeat(150)}. ${"b".repeat(150)}.`; expect(speechLines(s)[0]).toBe(`${"a".repeat(150)}.`)
  })
})
describe("guessLanguage", () => {
  it("recognises German, French, Spanish and Chinese, and defaults to English", () => {
    expect(guessLanguage("Ich habe die Unterlagen für den Investor nicht gefunden und wir werden das noch prüfen.")).toBe("German")
    expect(guessLanguage("Nous avons envoyé une proposition pour la réunion avec les investisseurs dans la semaine.")).toBe("French")
    expect(guessLanguage("Hemos enviado los documentos para la reunión con el fondo, pero no está listo.")).toBe("Spanish")
    expect(guessLanguage("今天有两个投资人回复了")).toBe("Chinese")
    expect(guessLanguage("You have two replies today and one task is due.")).toBe("English"); expect(guessLanguage("")).toBe("English")
  })
})
describe("wavToMp3", () => {
  it("produces MP3 audio, much smaller than the WAV, for mono and for stereo", () => {
    const w = sine(2); const mp3 = wavToMp3(w)
    expect(mp3.length).toBeGreaterThan(2000); expect(mp3.length).toBeLessThan(w.pcm.length / 5)
    expect(mp3[0]).toBe(0xff); expect(mp3[1] & 0xe0).toBe(0xe0)                      // MPEG audio frame sync
    const st = wavToMp3(sine(1, 24000, 2)); expect(st[0]).toBe(0xff)
  })
  it("handles a very short clip without throwing", () => expect(wavToMp3(sine(0.05)).length).toBeGreaterThan(0))
})
describe("speakAnswer", () => {
  it("speaks each line in the detected language with the chosen voice, joins them, and returns the length", async () => {
    const calls: Array<[string, string, string]> = []
    const r = await speakAnswer("**Hello**. " + "You have two replies today and one task is due. ".repeat(12), "Ethan", async (v, t, l) => { calls.push([v, t, l]); return sine(1.5) })
    expect(calls.length).toBeGreaterThan(1); expect(calls.length).toBeLessThanOrEqual(3); expect(calls.every(([v, , l]) => v === "Ethan" && l === "English")).toBe(true)
    expect(r!.seconds).toBeGreaterThanOrEqual(3); expect(r!.mp3[0]).toBe(0xff)
  })
  it("says nothing for an answer with nothing to say, and passes a service failure up", async () => {
    expect(await speakAnswer("`x`", "Cherry", async () => sine(1))).toBeNull()
    await expect(speakAnswer("This is long enough to speak aloud.", "Cherry", async () => { throw new Error("speech down") })).rejects.toThrow("speech down")
  })
})

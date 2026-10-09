import { randomUUID } from "node:crypto"
import { z } from "zod"
import { sql } from "@/lib/db"
import type { AiPrincipal } from "@/lib/assistant/context"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { safeFetch } from "@/lib/net/safe-fetch"
import { providerCall, requireConfiguration, ProviderError } from "./provider"
import { assertCreation, assertScope } from "./service"
import { publicAsset, storeAsset } from "./assets"
import { durationMs, joinWavs, parseWav, wavBytes } from "./wav"
/** Qwen3-TTS voices offered in the studio. docs/architecture/48. */
export const VOICES = [
  { id: "Ethan", label: "Ethan", gender: "male" },
  { id: "Ryan", label: "Ryan", gender: "male" },
  { id: "Aiden", label: "Aiden", gender: "male" },
  { id: "Cherry", label: "Cherry", gender: "female" },
  { id: "Serena", label: "Serena", gender: "female" },
  { id: "Jennifer", label: "Jennifer", gender: "female" },
] as const
export const MAX_LINES = 8,
  MAX_LINE_CHARS = 300,
  MAX_TRACK_MS = 30000,
  MIN_TRACK_MS = 2000,
  SPEECH_PER_DAY = 40
export const speechSchema = z
  .object({
    scopeKey: z.string().min(1).max(200),
    lines: z
      .array(
        z
          .object({
            voice: z.enum(VOICES.map((v) => v.id) as [string, ...string[]]),
            text: z
              .string()
              .trim()
              .min(1, "Write what this person says.")
              .max(MAX_LINE_CHARS, `Keep each line under ${MAX_LINE_CHARS} characters.`),
            /** Silence after this line, in milliseconds. */
            pauseMs: z.number().int().min(0).max(5000).default(450),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_LINES),
    language: z.enum(["English", "German", "French", "Spanish", "Chinese"]).default("English"),
  })
  .strict()
export type SpeechInput = z.infer<typeof speechSchema>
async function speakLine(voice: string, text: string, language: string) {
  const j = await providerCall("services/aigc/multimodal-generation/generation", {
    timeout: 45000,
    body: {
      model: "qwen3-tts-flash",
      input: { text, voice, language_type: language },
    },
  })
  const audio = j?.output?.audio
  // The reply carries a download link; some versions return the audio inline as base64 instead.
  if (typeof audio?.data === "string" && audio.data.length > 100)
    return parseWav(Buffer.from(audio.data, "base64"))
  const url = audio?.url
  if (typeof url !== "string" || !url.startsWith("https://")) {
    console.error(
      "[studio speech] no audio in reply; shape:",
      JSON.stringify(j, (k, v) =>
        typeof v === "string" && v.length > 60 ? `${v.slice(0, 30)}…(${v.length})` : v,
      ).slice(0, 600),
    )
    throw new ProviderError(502, "Speech returned no audio and may have been charged.")
  }
  const file = await safeFetch(url, {
    maxBytes: 8 * 1024 * 1024,
    timeoutMs: 30000,
  })
  return parseWav(file.body)
}
/** Speak each line in its voice, join them into one track with pauses between speakers, and keep it as a private audio asset. */
export async function createSpeech(p: AiPrincipal, input: SpeechInput) {
  assertScope(p, input.scopeKey, true)
  await assertCreation(p)
  await requireConfiguration()
  const [n] =
    await sql`SELECT count(*)::int AS n FROM ai_studio_assets WHERE user_id=${p.userId} AND kind='audio' AND job_id IS NULL AND created_at>now()-interval '1 day'`
  if (n.n >= SPEECH_PER_DAY)
    throw new WorkspaceError("Today's voice allowance is used up. Reuse a voice track or try tomorrow.", 429)
  const clips = []
  try {
    for (const l of input.lines) clips.push(await speakLine(l.voice, l.text, input.language))
  } catch (e) {
    if (e instanceof ProviderError)
      throw new WorkspaceError(e.message, e.status === 422 ? 422 : e.status === 429 ? 429 : 502)
    if (e instanceof WorkspaceError) throw e
    throw new WorkspaceError("A spoken line could not be read back. Try again; nothing was kept.", 502)
  }
  const track = joinWavs(
    clips,
    input.lines.map((l) => l.pauseMs),
    MIN_TRACK_MS,
  )
  if (durationMs(track) > MAX_TRACK_MS)
    throw new WorkspaceError(
      `The dialogue runs ${Math.round(durationMs(track) / 1000)} seconds; the limit is ${MAX_TRACK_MS / 1000}. Shorten it.`,
      400,
    )
  const asset = await storeAsset(p, randomUUID(), wavBytes(track), "audio", null, durationMs(track))
  // When each line starts and ends in the joined track, so captions and on-screen cues can follow the speech exactly.
  let at = 0
  const timeline = clips.map((c, i) => {
    const startMs = at,
      len = durationMs(c)
    at += len + (i < clips.length - 1 ? input.lines[i].pauseMs : 0)
    return { startMs, endMs: startMs + len }
  })
  return { asset: publicAsset(asset), timeline }
}

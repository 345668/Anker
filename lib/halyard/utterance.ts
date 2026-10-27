import "server-only"
import { transcribeAudio } from "@/lib/assistant/transcribe"
import { assertCan } from "@/lib/metering/allowance"
import { sql } from "@/lib/db"
import { addSegment, assertOn, HalyardError, type SessionRow } from "./sessions"

/** One uploaded utterance (docs/architecture/62 sections 7 and 11): at most 1 MB, WAV/WebM/Ogg/MP3/M4A, at most six a second per session. */
export const MAX_UTTERANCE_BYTES = 1_000_000
export const MAX_UTTERANCES_PER_SECOND = 6
export const MAX_UTTERANCE_SECONDS = 30
const EXT: Record<string, string> = { "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac" }
export type Transcribe = (bytes: Buffer, name: string, meterAs: { owner: string; seconds: number; source: string }) => Promise<string>
const defaultTranscribe: Transcribe = (bytes, name, meterAs) => transcribeAudio(bytes, name, undefined, meterAs)

const recent = new Map<string, number[]>()
/** In-memory per instance: a cheap guard against a runaway client, not a security boundary (the allowance and the size cap are). */
function rateOk(sessionId: string, now: number): boolean {
  const list = (recent.get(sessionId) ?? []).filter((t) => now - t < 1000)
  list.push(now); recent.set(sessionId, list)
  if (recent.size > 500) for (const k of recent.keys()) { recent.delete(k); if (recent.size <= 250) break }
  return list.length <= MAX_UTTERANCES_PER_SECOND
}
export const _resetRate = () => recent.clear()

export interface UtteranceInput { seq: number; channel: "you" | "them" | "room"; startedMs: number; endedMs: number; bytes: Buffer; mime: string; language?: string }
export type UtteranceResult = { stored: true; text: string } | { stored: false; reason: "duplicate_seq" | "repeat" | "empty" | "no_speech" | "echo" }

/**
 * Transcribes and stores one utterance. A repeated seq is answered without transcribing again (no second cost); a stretch with no recognisable speech (the voice detector
 * can be wrong) is a normal outcome, not an error. The words are metered as listening seconds against the workspace.
 */
export async function ingestUtterance(s: SessionRow, u: UtteranceInput, transcribe: Transcribe = defaultTranscribe, now = Date.now()): Promise<UtteranceResult> {
  if (s.state !== "live") throw new HalyardError(s.state === "paused" ? "The session is paused." : "That session has ended.", 409, s.state)
  await assertOn(s.org_id)
  if (!rateOk(s.id, now)) throw new HalyardError("Too many audio uploads at once. Slow down.", 429, "rate")
  const ext = EXT[u.mime.split(";")[0].trim().toLowerCase()]
  if (!ext) throw new HalyardError("Unsupported audio format.", 415, "bad_audio")
  if (!u.bytes.length) throw new HalyardError("The audio was empty.", 400, "bad_audio")
  if (u.bytes.length > MAX_UTTERANCE_BYTES) throw new HalyardError("That audio chunk is too large.", 413, "too_large")
  const seconds = Math.max(1, Math.round((u.endedMs - u.startedMs) / 1000))
  if (!(u.endedMs >= u.startedMs) || seconds > MAX_UTTERANCE_SECONDS) throw new HalyardError("The audio times are not valid.", 400, "bad_times")
  const { sql } = await import("@/lib/db")
  const [seen] = (await sql`SELECT 1 FROM halyard_segments WHERE session_id = ${s.id} AND seq = ${u.seq}`) as any[]
  if (seen) return { stored: false, reason: "duplicate_seq" }
  await assertCan(s.org_id, "speech_in", seconds).catch((e) => { throw new HalyardError(e.message, 402, "allowance") })
  let text: string
  const t0 = Date.now(), log = (ok: boolean, reason: string | null) => sql`INSERT INTO halyard_uploads (org_id, ok, reason, ms) VALUES (${s.org_id}, ${ok}, ${reason}, ${Date.now() - t0})`.catch(() => {})
  try { text = await transcribe(u.bytes, `u.${ext}`, { owner: s.org_id, seconds, source: "halyard" }); await log(true, null) } catch (e: any) {
    if (e?.status === 422) { await log(true, "no_speech"); return { stored: false, reason: "no_speech" } }
    await log(false, `http_${e?.status ?? "error"}`)
    throw new HalyardError(e?.status && e.status < 500 ? String(e.message) : "Transcription is not available just now. Your audio is kept on this device and retried.", e?.status === 413 ? 413 : 503, "asr")
  }
  const r = await addSegment(s, { seq: u.seq, channel: u.channel, text, startedMs: u.startedMs, endedMs: u.endedMs, audioSeconds: seconds })
  return r.stored ? { stored: true, text } : { stored: false, reason: r.reason! }
}

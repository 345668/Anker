/**
 * Audio attachments → text (docs/architecture/36). Qwen3-ASR-Flash through the
 * OpenAI-compatible chat endpoint, audio sent inline as a data URL. The provider caps one
 * request at 5 minutes / 10 MB encoded, so longer recordings are refused with advice to
 * trim, not silently truncated. Uses the standard (free / pay-as-you-go) lane: the
 * token plan does not serve ASR.
 */
import { standardQwen } from "@/lib/ai/qwen-standard"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { AUDIO_MAX_BYTES } from "./attachment-limits"

const MIME: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", flac: "audio/flac", webm: "audio/webm" }
export const audioMime = (name: string) => MIME[name.toLowerCase().split(".").pop() ?? ""] ?? null

export async function transcribeAudio(bytes: Buffer, name: string, signal?: AbortSignal): Promise<string> {
  const mime = audioMime(name)
  if (!mime) throw new WorkspaceError("Unsupported audio format. Use MP3, WAV, M4A, AAC, OGG, FLAC or WebM.", 400)
  if (bytes.length > AUDIO_MAX_BYTES) throw new WorkspaceError("Audio is limited to about 5 minutes (7 MB). Trim the recording and attach it again.", 413)
  const q = await standardQwen()
  if (!q) throw new WorkspaceError("Audio needs a Qwen key on the free or pay-as-you-go lane. An administrator can add one in AI settings.", 503)
  const res = await fetch(`${q.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${q.apiKey}` },
    body: JSON.stringify({
      model: process.env.QWEN_ASR_MODEL || "qwen3-asr-flash",
      messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: `data:${mime};base64,${bytes.toString("base64")}` } }] }],
      stream: false,
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
  }).catch((e: Error) => { throw new WorkspaceError(e.name === "TimeoutError" ? "Transcription timed out. Try a shorter recording." : "Transcription could not be reached. Try again.", 504) })
  if (!res.ok) {
    console.error("[assistant-transcribe] non-200:", res.status, (await res.text().catch(() => "")).slice(0, 200))
    throw new WorkspaceError(res.status === 401 || res.status === 403 ? "The transcription service rejected its credentials. An administrator needs to check the Qwen key." : "Could not transcribe this audio. Try again, or attach a transcript.", 502)
  }
  const json: any = await res.json().catch(() => ({}))
  const text = String(json?.choices?.[0]?.message?.content ?? "").trim()
  if (!text) throw new WorkspaceError("No speech was recognised in this audio.", 422)
  return text
}

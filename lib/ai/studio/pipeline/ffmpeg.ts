import { spawn } from "node:child_process"
import ffmpegPath from "ffmpeg-static"

/** The bundled ffmpeg (docs/architecture/51 section 5.4): no new infrastructure, it runs inside the function. */
export function ffmpegBinary(): string {
  if (!ffmpegPath) throw new Error("ffmpeg is not available in this runtime.")
  return ffmpegPath
}

export interface Ran {
  code: number
  stderr: string
}

/** Runs ffmpeg and returns its exit code and the tail of its log. Never throws on a non-zero exit: callers decide. */
export function ffmpeg(args: string[], timeoutMs = 240_000): Promise<Ran> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinary(), ["-hide_banner", "-nostdin", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    })
    let stderr = ""
    child.stderr.on("data", (d) => {
      stderr = (stderr + String(d)).slice(-60_000)
    })
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error("The video step took too long."))
    }, timeoutMs)
    child.on("error", (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stderr })
    })
  })
}

/** Like ffmpeg(), but a failed run is an error carrying the last lines of the log. */
export async function ffmpegOk(args: string[], timeoutMs?: number): Promise<void> {
  const r = await ffmpeg(args, timeoutMs)
  if (r.code !== 0)
    throw new Error(
      "The video step failed: " + r.stderr.trim().split("\n").slice(-3).join(" | ").slice(0, 400),
    )
}

export interface MediaInfo {
  durationS: number
  hasVideo: boolean
  hasAudio: boolean
  width: number | null
  height: number | null
  fps: number | null
}

/** Reads the container with `ffmpeg -i` (there is no ffprobe in the bundle). A file ffmpeg cannot read has no streams. */
export async function probe(file: string): Promise<MediaInfo> {
  const { stderr } = await ffmpeg(["-i", file], 30_000)
  const d = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  const v = stderr.match(/Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})[^\n]*/)
  const fps = stderr.match(/Stream #[^\n]*Video:[^\n]*?(\d+(?:\.\d+)?)\s*fps/)
  return {
    durationS: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
    hasVideo: !!v,
    hasAudio: /Stream #[^\n]*Audio:/.test(stderr),
    width: v ? Number(v[1]) : null,
    height: v ? Number(v[2]) : null,
    fps: fps ? Number(fps[1]) : null,
  }
}

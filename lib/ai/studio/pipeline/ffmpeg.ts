import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream, createWriteStream, existsSync } from "node:fs"
import { chmod, mkdir, rename, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { get } from "@vercel/blob"

/**
 * The ffmpeg this runtime uses (docs/architecture/51 section 12.1).
 *
 * On Vercel the binary is too big to ship inside a function (the 250 MB limit), so it is fetched once per instance from our private Blob into /tmp,
 * and only if its SHA-256 equals the pinned value below: a swapped or damaged file is refused and removed. Locally and in CI the platform
 * package is used. `ANKER_FFMPEG_PATH` overrides both. Loaded lazily, so a missing binary fails the step, not every route.
 */
export const PINNED_FFMPEG = {
  /** Where the file is in the private media Blob store (uploaded once; see the section 12.1 notes). */
  pathname: "ffmpeg-linux-x64-4.1.0",
  /** @ffmpeg-installer/linux-x64@4.1.0 (a static ffmpeg build of 2018-12-10, GPLv3). */
  sha256: "6d0c625dbd3f604ed2618981ba6fee7e29678855ab741d654cfc9effb0226624",
  bytes: 68174760,
} as const

const inFlight = new Map<string, Promise<string>>()
const verified = new Set<string>()

async function sha256File(path: string): Promise<string> {
  const h = createHash("sha256")
  await pipeline(createReadStream(path), async function* (src) {
    for await (const chunk of src) h.update(chunk as Buffer)
  })
  return h.digest("hex")
}

export interface EnsureOptions {
  pathname: string
  sha256: string
  bytes: number
  dir: string
  open: (pathname: string) => Promise<ReadableStream | null>
}

/** Makes sure a verified, executable copy of the pinned binary is at a path, downloading it if needed. Concurrent callers share one download. */
export function ensureFfmpeg(o: EnsureOptions): Promise<string> {
  const target = join(o.dir, `ffmpeg-${o.sha256.slice(0, 12)}`)
  const running = inFlight.get(target)
  if (running) return running
  const job = (async () => {
    await mkdir(o.dir, { recursive: true })
    if (verified.has(target) && existsSync(target)) return target
    if (existsSync(target)) {
      // A copy from an earlier use of this instance: trust it only if it still hashes to the pin.
      if ((await stat(target)).size === o.bytes && (await sha256File(target)) === o.sha256) {
        verified.add(target)
        return target
      }
      await rm(target, { force: true })
    }
    const stream = await o.open(o.pathname)
    if (!stream) throw new Error(`the ffmpeg binary is not in storage (expected ${o.pathname})`)
    const part = `${target}.part-${process.pid}-${Date.now()}`
    const h = createHash("sha256")
    let size = 0
    try {
      await pipeline(
        Readable.fromWeb(stream as never),
        async function* (src) {
          for await (const chunk of src) {
            h.update(chunk as Buffer)
            size += (chunk as Buffer).length
            yield chunk
          }
        },
        createWriteStream(part, { mode: 0o755 }),
      )
      if (size !== o.bytes || h.digest("hex") !== o.sha256)
        throw new Error("the downloaded ffmpeg does not match the pinned checksum and was refused")
      await chmod(part, 0o755)
      await rename(part, target)
    } catch (e) {
      await rm(part, { force: true })
      throw e
    }
    verified.add(target)
    return target
  })()
  inFlight.set(target, job)
  const clear = () => inFlight.delete(target)
  job.then(clear, clear)
  return job
}

export function _resetFfmpegCache() {
  inFlight.clear()
  verified.clear()
}

export async function ffmpegBinary(): Promise<string> {
  try {
    if (process.env.ANKER_FFMPEG_PATH) return process.env.ANKER_FFMPEG_PATH
    if (process.env.VERCEL) {
      return await ensureFfmpeg({
        ...PINNED_FFMPEG,
        dir: join(tmpdir(), "anker-ffmpeg"),
        open: async (pathname) => {
          const f = await get(pathname, {
            access: "private",
            token: process.env.MEDIA_BLOB_READ_WRITE_TOKEN,
            abortSignal: AbortSignal.timeout(120_000),
          })
          return f && f.statusCode === 200 ? f.stream : null
        },
      })
    }
    // Development and CI: the platform package. A computed name keeps the bundler from tracing it into a deployed function.
    const name = ["@ffmpeg-installer", "ffmpeg"].join("/")
    const m = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ name)) as {
      path?: string
      default?: { path?: string }
    }
    const path = m.path ?? m.default?.path
    if (!path) throw new Error("no path")
    return path
  } catch (e) {
    throw new Error(
      "ffmpeg is not available in this runtime: " + String((e as Error)?.message ?? e).slice(0, 200),
    )
  }
}

/**
 * How a stage opens a customer's or a provider's file. The container is forced to MP4 and only local files may be read, so a crafted file
 * cannot make ffmpeg pick another demuxer (playlists, concat lists) or fetch a URL. The ffmpeg we can run in production is an older build.
 */
export const mp4Input = (file: string) => ["-protocol_whitelist", "file", "-f", "mp4", "-i", file]

export interface Ran {
  code: number
  stderr: string
}

/** Runs ffmpeg and returns its exit code and the tail of its log. Never throws on a non-zero exit: callers decide. */
export async function ffmpeg(args: string[], timeoutMs = 240_000): Promise<Ran> {
  const binary = await ffmpegBinary()
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["-hide_banner", "-nostdin", ...args], {
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
  const { stderr } = await ffmpeg(mp4Input(file), 30_000)
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

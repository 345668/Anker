import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sql } from "@/lib/db"
import { mediaFormat } from "../assets"
import { ffmpegOk, probe } from "./ffmpeg"
import { pipelinePath, sha256, type PipelineStorage } from "./storage"
import type { NewArtifact, Runners, StageContext } from "./runner"

export const MAX_SOURCE_BYTES = 100 * 1024 * 1024
export const MAX_REFERENCE_BYTES = 15 * 1024 * 1024
export const MAX_SECONDS = 30
/** Names a client may upload into a pipeline (the upload route allows exactly these). */
export const INCOMING_SOURCE = "incoming/source.mp4"
export const incomingReference = (n: number, ext: string) => `incoming/reference-${n}.${ext}`
export const INCOMING_REFERENCE = /^incoming\/reference-[1-4]\.(png|jpg|webp)$/

/** +3 semitones with the timing kept: raise the rate, resample, then slow the tempo back by the same factor. */
const PITCH_UP_3 = "aresample=44100,asetrate=52444,aresample=44100,atempo=0.840896"

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "anker-pipe-"))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

const mp4 = (kind: string, bytes: Buffer, path: string): NewArtifact => ({
  kind,
  pathname: path,
  contentType: "video/mp4",
  bytes: bytes.length,
  sha256: sha256(bytes),
})

type Consent = { id: string; source_sha256: string; reference_sha256: string[]; voice_altered: boolean }
async function consentOf(pipelineId: string): Promise<Consent> {
  const [c] =
    (await sql`SELECT c.id, c.source_sha256, c.reference_sha256, c.voice_altered FROM ai_studio_pipelines p JOIN ai_studio_consents c ON c.id = p.consent_id WHERE p.id = ${pipelineId}`) as any[]
  if (!c) throw new Error("The consent record for this pipeline is missing.")
  return c
}
const need = (ctx: StageContext, kind: string) => {
  const a = ctx.artifacts.find((x) => x.kind === kind)
  if (!a) throw new Error(`The ${kind} file from an earlier step is missing.`)
  return a
}

/**
 * The stages that need no model (docs/architecture/51). The two generation stages are not here: they are added when the provider call is verified.
 */
export function stageRunners(storage: PipelineStorage): Runners {
  const path = (ctx: StageContext, name: string) =>
    pipelinePath(ctx.userId, ctx.scopeKey, ctx.pipelineId, name)
  return {
    /** Checks what was uploaded against what the person consented to, then moves it into place. */
    async ingest(ctx) {
      const consent = await consentOf(ctx.pipelineId)
      const out: NewArtifact[] = []
      const source = await storage.get(path(ctx, INCOMING_SOURCE))
      if (source.length > MAX_SOURCE_BYTES) throw new Error("The video is larger than 100 MB.")
      if (sha256(source) !== consent.source_sha256)
        throw new Error(
          "This video is not the footage the consent was given for. Record a new consent for it.",
        )
      if (mediaFormat(source)?.kind !== "video") throw new Error("The source must be an MP4 video.")
      const info = await withTmp(async (dir) => {
        await writeFile(join(dir, "in.mp4"), source)
        return probe(join(dir, "in.mp4"))
      })
      if (!info.hasVideo) throw new Error("The file has no video that can be read.")
      if (info.durationS < 1 || info.durationS > MAX_SECONDS + 0.5)
        throw new Error(
          `Use a clip between 1 and ${MAX_SECONDS} seconds (this one is ${info.durationS.toFixed(1)}).`,
        )
      if ((info.width ?? 0) < 128 || (info.height ?? 0) < 128)
        throw new Error("The video is too small to use.")
      const sourcePath = path(ctx, "source.mp4")
      await storage.put(sourcePath, source, "video/mp4")
      out.push(mp4("source", source, sourcePath))
      for (const [i, want] of consent.reference_sha256.entries()) {
        let found: { name: string; bytes: Buffer; ext: string } | null = null
        for (const ext of ["png", "jpg", "webp"]) {
          const name = incomingReference(i + 1, ext)
          try {
            found = { name, bytes: await storage.get(path(ctx, name)), ext }
            break
          } catch {}
        }
        if (!found) throw new Error(`Reference image ${i + 1} was not uploaded.`)
        if (found.bytes.length > MAX_REFERENCE_BYTES)
          throw new Error(`Reference image ${i + 1} is larger than 15 MB.`)
        const f = mediaFormat(found.bytes)
        if (f?.kind !== "image") throw new Error(`Reference ${i + 1} must be a PNG, JPEG or WebP image.`)
        if (sha256(found.bytes) !== want)
          throw new Error(`Reference image ${i + 1} is not the image the consent was given for.`)
        const refPath = path(ctx, `reference-${i + 1}.${f.ext}`)
        await storage.put(refPath, found.bytes, f.type)
        out.push({
          kind: `reference_${i + 1}`,
          pathname: refPath,
          contentType: f.type,
          bytes: found.bytes.length,
          sha256: want,
        })
        await storage.delete(path(ctx, found.name))
      }
      await storage.delete(path(ctx, INCOMING_SOURCE))
      return { artifacts: out }
    },

    /** 24 fps, at most 960 px on the long side, even dimensions, at most 30 seconds. */
    async normalise(ctx) {
      const src = need(ctx, "source")
      const bytes = await storage.get(src.pathname)
      return withTmp(async (dir) => {
        await writeFile(join(dir, "in.mp4"), bytes)
        await ffmpegOk([
          "-y",
          "-i",
          join(dir, "in.mp4"),
          "-t",
          String(MAX_SECONDS),
          "-vf",
          "scale='min(960,iw)':'min(960,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24,format=yuv420p",
          "-c:v",
          "libx264",
          "-crf",
          "20",
          "-preset",
          "veryfast",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          join(dir, "out.mp4"),
        ])
        const out = await readFile(join(dir, "out.mp4"))
        const p = path(ctx, "prepared.mp4")
        await storage.put(p, out, "video/mp4")
        return { artifacts: [mp4("prepared", out, p)] }
      })
    },

    /**
     * Puts the original audio under the generated picture. The video is held on its last frame when it is up to half a second short;
     * a larger difference is refused rather than trimmed, looped or stretched. With a consent that says the voice is altered, the voice is pitched +3 semitones.
     */
    async restore_audio(ctx) {
      const consent = await consentOf(ctx.pipelineId)
      const final = await storage.get(need(ctx, "final").pathname)
      const source = await storage.get(need(ctx, "source").pathname)
      return withTmp(async (dir) => {
        await writeFile(join(dir, "gen.mp4"), final)
        await writeFile(join(dir, "src.mp4"), source)
        const [g, s] = [await probe(join(dir, "gen.mp4")), await probe(join(dir, "src.mp4"))]
        if (!g.hasVideo) throw new Error("The generated video cannot be read.")
        if (!s.hasAudio) {
          const p = path(ctx, "restored.mp4")
          await storage.put(p, final, "video/mp4")
          return { artifacts: [mp4("restored", final, p)] }
        }
        const gap = s.durationS - g.durationS
        if (Math.abs(gap) > 0.5)
          throw new Error(
            "The generated video's length differs from the original audio by more than half a second. It was not trimmed, looped or stretched.",
          )
        const hold =
          gap > 0.04
            ? [
                "-vf",
                `tpad=stop_mode=clone:stop_duration=${gap.toFixed(3)}`,
                "-c:v",
                "libx264",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
              ]
            : ["-c:v", "copy"]
        const audio = consent.voice_altered
          ? ["-af", PITCH_UP_3, "-c:a", "aac", "-b:a", "160k"]
          : ["-c:a", "copy"]
        await ffmpegOk([
          "-y",
          "-i",
          join(dir, "gen.mp4"),
          "-i",
          join(dir, "src.mp4"),
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          ...hold,
          ...audio,
          "-t",
          s.durationS.toFixed(3),
          "-movflags",
          "+faststart",
          join(dir, "out.mp4"),
        ])
        const out = await readFile(join(dir, "out.mp4"))
        const p = path(ctx, "restored.mp4")
        await storage.put(p, out, "video/mp4")
        return { artifacts: [mp4("restored", out, p)] }
      })
    },

    /** The delivery copy carries a plain statement that it is synthetic, the consent record, and whether the voice was altered. No names are written into it. */
    async deliver(ctx) {
      const consent = await consentOf(ctx.pipelineId)
      const bytes = await storage.get(need(ctx, "restored").pathname)
      return withTmp(async (dir) => {
        await writeFile(join(dir, "in.mp4"), bytes)
        const note = `Synthetic media made with Anker Media Studio. Consent record ${consent.id}. Voice altered: ${consent.voice_altered ? "yes" : "no"}.`
        await ffmpegOk([
          "-y",
          "-i",
          join(dir, "in.mp4"),
          "-c",
          "copy",
          "-metadata",
          "title=Synthetic media (Anker Media Studio)",
          "-metadata",
          `comment=${note}`,
          "-movflags",
          "+faststart",
          join(dir, "out.mp4"),
        ])
        const out = await readFile(join(dir, "out.mp4"))
        const p = path(ctx, "delivered.mp4")
        await storage.put(p, out, "video/mp4")
        return { artifacts: [mp4("delivered", out, p)] }
      })
    },
  }
}

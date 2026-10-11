import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import type { AiPrincipal } from "@/lib/assistant/context"

const state = vi.hoisted(() => ({ query: null as any }))
vi.mock("@/lib/db", () => ({
  sql: Object.assign(
    (s: TemplateStringsArray, ...v: unknown[]) =>
      state.query(
        s.reduce((q, p, i) => q + (i ? `$${i}` : "") + p, ""),
        v,
      ),
    { unsafe: (q: string, v: unknown[] = []) => state.query(q, v) },
  ),
}))
vi.mock("server-only", () => ({}))
vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }))

import { CONSENT_VERSION, recordConsent } from "./consent"
import { ffmpegOk, probe } from "./ffmpeg"
import { createPipeline, runNextStage, getPipeline } from "./runner"
import { currentSetHash, submitReview } from "./review"
import { INCOMING_SOURCE, incomingReference, stageRunners } from "./stages"
import { memoryStorage, pipelinePath, sha256 } from "./storage"

let db: PGlite
let dir: string
const p: AiPrincipal = {
  userId: "u1",
  scopeKey: "org:one",
  orgId: "one",
  persona: "vc",
  membership: null,
  lpMemberships: [],
  canWrite: true,
  readonly: false,
  allowedTools: null,
}
const attest = {
  ownsOrMayUseSource: true,
  everyPersonInSourceAgreed: true,
  everyReferenceIdentityAgreed: true,
  noPublicFigureOrMinor: true,
  understandsProvenance: true,
}

/** A real, tiny clip made by ffmpeg itself: moving test pattern plus a tone. */
async function makeClip(name: string, seconds: number, size = "1280x720", fps = 30, audio = true) {
  const out = join(dir, name)
  await ffmpegOk([
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=${size}:rate=${fps}:duration=${seconds}`,
    ...(audio
      ? ["-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}:sample_rate=44100`, "-c:a", "aac"]
      : []),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    out,
  ])
  return readFile(out)
}
async function makePng() {
  const out = join(dir, "ref.png")
  await ffmpegOk(["-y", "-f", "lavfi", "-i", "color=c=teal:size=256x256:duration=1", "-frames:v", "1", out])
  return readFile(out)
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "anker-stage-test-"))
  db = new PGlite()
  state.query = async (q: string, v: unknown[]) => (await db.query(q, v)).rows
  await db.exec(
    "CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text)",
  )
  await db.exec(readFileSync("scripts/migrations/2026-10-11-ai-studio-pipelines.sql", "utf8"))
}, 30000)
afterAll(async () => {
  await db.close()
  await rm(dir, { recursive: true, force: true })
})
beforeEach(() =>
  db.exec(
    "TRUNCATE ai_studio_reviews, ai_studio_artifacts, ai_studio_stages, ai_studio_pipelines, ai_studio_consents CASCADE",
  ),
)

async function upload(
  source: Buffer,
  ref: Buffer,
  over: { sourceSha?: string; voiceAltered?: boolean } = {},
) {
  const store = memoryStorage()
  const { id: consentId } = await recordConsent(p, {
    statementVersion: CONSENT_VERSION,
    attest,
    subjects: "Test clip of ourselves, replaced by a test colour card",
    sourceSha256: over.sourceSha ?? sha256(source),
    referenceSha256: [sha256(ref)],
    voiceAltered: over.voiceAltered ?? false,
  })
  const pipe = await createPipeline(p, { requestKey: randomUUID(), consentId })
  await store.put(pipelinePath(p.userId, p.scopeKey, pipe.id, INCOMING_SOURCE), source, "video/mp4")
  await store.put(pipelinePath(p.userId, p.scopeKey, pipe.id, incomingReference(1, "png")), ref, "image/png")
  return { store, pipe }
}
const kinds = async (id: string) =>
  (
    (await db.query("SELECT kind FROM ai_studio_artifacts WHERE pipeline_id=$1 ORDER BY kind", [id]))
      .rows as any[]
  ).map((r) => r.kind)

describe("ingest and normalise, with a real ffmpeg", () => {
  it("accepts the footage the consent was given for, moves it into place and removes the incoming copies", async () => {
    const { store, pipe } = await upload(await makeClip("a.mp4", 3), await makePng())
    const r = stageRunners(store)
    expect(await runNextStage(p, pipe.id, r)).toMatchObject({ ran: "ingest", status: "running" })
    expect(await kinds(pipe.id)).toEqual(["reference_1", "source"])
    expect([...store.files.keys()].some((k) => k.includes("/incoming/"))).toBe(false)
  })
  it("refuses a video that is not the one consented to", async () => {
    const { store, pipe } = await upload(await makeClip("b.mp4", 3), await makePng(), {
      sourceSha: sha256(Buffer.from("other")),
    })
    expect(await runNextStage(p, pipe.id, stageRunners(store))).toMatchObject({
      ran: "ingest",
      status: "failed",
    })
    expect((await getPipeline(p, pipe.id)).error).toMatch(/not the footage the consent was given for/)
  })
  it("refuses a clip over 30 seconds, a non-video and a missing reference", async () => {
    const long = await upload(await makeClip("long.mp4", 34, "320x240", 10, false), await makePng())
    expect(await runNextStage(p, long.pipe.id, stageRunners(long.store))).toMatchObject({ status: "failed" })
    expect((await getPipeline(p, long.pipe.id)).error).toMatch(/between 1 and 30 seconds/)
    const junk = await upload(Buffer.from("not a video at all, just text"), await makePng())
    expect(await runNextStage(p, junk.pipe.id, stageRunners(junk.store))).toMatchObject({ status: "failed" })
    const ok = await upload(await makeClip("c.mp4", 2), await makePng())
    ok.store.files.delete(pipelinePath(p.userId, p.scopeKey, ok.pipe.id, incomingReference(1, "png")))
    expect(await runNextStage(p, ok.pipe.id, stageRunners(ok.store))).toMatchObject({ status: "failed" })
    expect((await getPipeline(p, ok.pipe.id)).error).toMatch(/Reference image 1 was not uploaded/)
  })
  it("normalises to at most 960 px, 24 fps and even sizes, keeping the audio", async () => {
    const { store, pipe } = await upload(await makeClip("big.mp4", 3, "1920x1080", 30), await makePng())
    const r = stageRunners(store)
    await runNextStage(p, pipe.id, r)
    expect(await runNextStage(p, pipe.id, r)).toMatchObject({ ran: "normalise" })
    const out = [...store.files.entries()].find(([k]) => k.endsWith("prepared.mp4"))!
    const f = join(dir, "prepared-check.mp4")
    await writeFile(f, out[1].bytes)
    const info = await probe(f)
    expect(Math.max(info.width!, info.height!)).toBe(960)
    expect(info.width! % 2).toBe(0)
    expect(info.height! % 2).toBe(0)
    expect(Math.round(info.fps!)).toBe(24)
    expect(info.hasAudio).toBe(true)
    expect(info.durationS).toBeGreaterThan(2.8)
  })
  it("handles a tall clip with odd dimensions: both sides come out even and within 960", async () => {
    const { store, pipe } = await upload(
      await makeClip("tall.mp4", 2, "502x1002", 25, false),
      await makePng(),
    )
    const r = stageRunners(store)
    await runNextStage(p, pipe.id, r)
    await runNextStage(p, pipe.id, r)
    const out = [...store.files.entries()].find(([k]) => k.endsWith("prepared.mp4"))!
    const f = join(dir, "tall-check.mp4")
    await writeFile(f, out[1].bytes)
    const info = await probe(f)
    expect(info.height).toBeLessThanOrEqual(960)
    expect(info.width! % 2).toBe(0)
    expect(info.height! % 2).toBe(0)
    expect(info.height!).toBeGreaterThan(info.width!)
  })
})

/** Runs a pipeline through the review and puts a generated clip in place of the (not yet built) generation stages. */
async function toRestore(generatedSeconds: number, voiceAltered = false) {
  const source = await makeClip(`src-${randomUUID()}.mp4`, 4)
  const { store, pipe } = await upload(source, await makePng(), { voiceAltered })
  const r = stageRunners(store)
  await runNextStage(p, pipe.id, r)
  await runNextStage(p, pipe.id, r)
  await submitReview(p, pipe.id, "input", {
    approved: true,
    expectedHash: await currentSetHash(pipe.id, "input"),
  })
  const gen = await makeClip(`gen-${randomUUID()}.mp4`, generatedSeconds, "640x640", 24, false)
  const fake = { draft: gen, final: gen }
  const place = async (kind: "draft" | "final", ord: number) => {
    const path = pipelinePath(p.userId, p.scopeKey, pipe.id, `${kind}.mp4`)
    await store.put(path, fake[kind], "video/mp4")
    await db.query(
      "INSERT INTO ai_studio_artifacts(id,pipeline_id,stage_ord,kind,pathname,content_type,bytes,sha256) VALUES($1,$2,$3,$4,$5,'video/mp4',$6,$7)",
      [randomUUID(), pipe.id, ord, kind, path, gen.length, sha256(gen)],
    )
    await db.query("UPDATE ai_studio_stages SET status='done' WHERE pipeline_id=$1 AND ord=$2", [
      pipe.id,
      ord,
    ])
  }
  await place("draft", 3)
  await db.query("UPDATE ai_studio_stages SET status='done' WHERE pipeline_id=$1 AND ord=4", [pipe.id]) // approve_final
  await place("final", 5)
  return { store, pipe, r }
}
const stored = (store: ReturnType<typeof memoryStorage>, name: string) =>
  [...store.files.entries()].find(([k]) => k.endsWith(name))![1].bytes

describe("restore audio and deliver", () => {
  it("puts the original audio under the generated picture and holds the last frame for a small gap", async () => {
    const { store, pipe, r } = await toRestore(3.8)
    expect(await runNextStage(p, pipe.id, r)).toMatchObject({ ran: "restore_audio", status: "running" })
    const f = join(dir, "restored-check.mp4")
    await writeFile(f, stored(store, "restored.mp4"))
    const info = await probe(f)
    expect(info.hasAudio && info.hasVideo).toBe(true)
    expect(info.durationS).toBeGreaterThan(3.9)
    expect(info.durationS).toBeLessThan(4.15)
  })
  it("refuses a generated clip whose length differs by more than half a second", async () => {
    const { pipe, r } = await toRestore(2)
    expect(await runNextStage(p, pipe.id, r)).toMatchObject({ ran: "restore_audio", status: "failed" })
    expect((await getPipeline(p, pipe.id)).error).toMatch(/not trimmed, looped or stretched/)
  })
  it("shifts the voice only when the consent says it is altered, and the delivery carries a synthetic-media note without names", async () => {
    const { store, pipe, r } = await toRestore(4, true)
    await runNextStage(p, pipe.id, r) // restore_audio
    expect(await runNextStage(p, pipe.id, r)).toMatchObject({ ran: "deliver" })
    const f = join(dir, "delivered-check.mp4")
    await writeFile(f, stored(store, "delivered.mp4"))
    const { stderr } = await (await import("./ffmpeg")).ffmpeg(["-i", f])
    expect(stderr).toMatch(/Synthetic media made with Anker Media Studio/)
    expect(stderr).toMatch(/Voice altered: yes/)
    expect(stderr).not.toMatch(/test colour card/)
    expect((await probe(f)).hasAudio).toBe(true)
    // The source tone is 440 Hz; +3 semitones is 523 Hz, with the duration unchanged.
    const raw = join(dir, "delivered.pcm")
    await ffmpegOk(["-y", "-i", f, "-vn", "-ac", "1", "-ar", "44100", "-f", "s16le", raw])
    const buf = await readFile(raw)
    const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) as ArrayBuffer)
    const mid = pcm.slice(8000, 8000 + 44100)
    let crossings = 0
    for (let i = 1; i < mid.length; i++) if (mid[i - 1] < 0 && mid[i] >= 0) crossings++
    expect(crossings).toBeGreaterThan(505)
    expect(crossings).toBeLessThan(540)
    expect(pcm.length / 44100).toBeGreaterThan(3.9)
    expect(pcm.length / 44100).toBeLessThan(4.2)
    expect(await runNextStage(p, pipe.id, r)).toEqual({ ran: null, status: "completed" })
  })
})

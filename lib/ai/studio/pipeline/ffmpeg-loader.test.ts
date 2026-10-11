import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHash } from "node:crypto"
import { access, constants, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { _resetFfmpegCache, ensureFfmpeg, PINNED_FFMPEG } from "./ffmpeg"

vi.mock("@vercel/blob", () => ({ get: vi.fn() }))
vi.mock("server-only", () => ({}))

const body = Buffer.from("#!/bin/sh\necho pretend ffmpeg\n" + "x".repeat(5000))
const sha = createHash("sha256").update(body).digest("hex")
const streamOf = (b: Buffer) =>
  new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(b.subarray(0, 100)))
      c.enqueue(new Uint8Array(b.subarray(100)))
      c.close()
    },
  })
let dir: string
const opts = (open: (p: string) => Promise<ReadableStream | null>, over: object = {}) => ({
  pathname: "ffmpeg-test",
  sha256: sha,
  bytes: body.length,
  dir,
  open,
  ...over,
})

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "anker-ffloader-"))
  _resetFfmpegCache()
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe("fetching the pinned ffmpeg", () => {
  it("downloads it once, verifies it, makes it executable and reuses it", async () => {
    const open = vi.fn(async () => streamOf(body))
    const path = await ensureFfmpeg(opts(open))
    expect(await readFile(path)).toEqual(body)
    await expect(access(path, constants.X_OK)).resolves.toBeUndefined()
    expect(open).toHaveBeenCalledWith("ffmpeg-test")
    expect(await ensureFfmpeg(opts(open))).toBe(path)
    expect(open).toHaveBeenCalledTimes(1)
  })
  it("refuses and removes a file that does not match the pinned checksum", async () => {
    const wrong = Buffer.concat([body.subarray(0, body.length - 1), Buffer.from("!")])
    await expect(ensureFfmpeg(opts(async () => streamOf(wrong)))).rejects.toThrow(/pinned checksum/)
    expect(await readdir(dir)).toEqual([])
  })
  it("refuses a file of the wrong size even if it is a prefix of the right one", async () => {
    await expect(ensureFfmpeg(opts(async () => streamOf(body.subarray(0, 2000))))).rejects.toThrow(
      /pinned checksum/,
    )
    expect(await readdir(dir)).toEqual([])
  })
  it("says what is missing when the binary was never uploaded", async () => {
    await expect(ensureFfmpeg(opts(async () => null))).rejects.toThrow(
      /not in storage \(expected ffmpeg-test\)/,
    )
  })
  it("two callers at once share one download", async () => {
    const open = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 30))
      return streamOf(body)
    })
    const [a, b] = await Promise.all([ensureFfmpeg(opts(open)), ensureFfmpeg(opts(open))])
    expect(a).toBe(b)
    expect(open).toHaveBeenCalledTimes(1)
  })
  it("a cached copy that was altered is replaced, not trusted", async () => {
    const open = vi.fn(async () => streamOf(body))
    const path = await ensureFfmpeg(opts(open))
    _resetFfmpegCache() // a new instance start: nothing is remembered as verified
    await writeFile(path, Buffer.alloc(body.length, 7))
    expect(await ensureFfmpeg(opts(open))).toBe(path)
    expect(await readFile(path)).toEqual(body)
    expect(open).toHaveBeenCalledTimes(2)
    expect((await stat(path)).size).toBe(body.length)
  })
  it("a failed download can be tried again", async () => {
    await expect(ensureFfmpeg(opts(async () => null))).rejects.toThrow()
    await expect(ensureFfmpeg(opts(async () => streamOf(body)))).resolves.toContain("ffmpeg-")
  })
})

describe("the pin", () => {
  it("names the Linux binary that was checked, with a real digest", () => {
    expect(PINNED_FFMPEG.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(PINNED_FFMPEG.bytes).toBe(68174760)
    expect(PINNED_FFMPEG.pathname).toBe("ffmpeg-linux-x64-4.1.0")
  })
})

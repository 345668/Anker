import { describe, it, expect } from "vitest"
import { oggCrc, parseOgg, buildPage, splitOggOpus, oggInfo, isOgg } from "./ogg"

const RATE = 48000, PRE_SKIP = 312
/** A synthetic Ogg Opus stream: OpusHead, OpusTags, then audio pages of 20 ms packets, each page 1 second (50 packets). Optionally one packet spans two pages. */
function makeStream(seconds: number, opts: { spanAt?: number } = {}): Buffer {
  const page = (body: Buffer, o: { seq: number; granule: bigint; type: number; segs?: number[] }) => {
    const segs = o.segs ?? [body.length]
    const h = Buffer.alloc(27 + segs.length)
    h.write("OggS", 0, "latin1"); h[4] = 0; h[5] = o.type; h.writeBigInt64LE(o.granule, 6); h.writeUInt32LE(777, 14); h.writeUInt32LE(o.seq, 18); h[26] = segs.length; segs.forEach((s, i) => (h[27 + i] = s))
    const full = Buffer.concat([h, body]); full.writeUInt32LE(0, 22); full.writeUInt32LE(oggCrc(full), 22); return full
  }
  const head = Buffer.alloc(19); head.write("OpusHead", 0, "latin1"); head[8] = 1; head[9] = 1; head.writeUInt16LE(PRE_SKIP, 10); head.writeUInt32LE(48000, 12)
  const tags = Buffer.concat([Buffer.from("OpusTags", "latin1"), Buffer.alloc(8)])
  const pages = [page(head, { seq: 0, granule: BigInt(0), type: 2 }), page(tags, { seq: 1, granule: BigInt(0), type: 0 })]
  for (let s = 1; s <= seconds; s++) {
    const body = Buffer.alloc(50 * 40, s % 250); const continued = opts.spanAt === s
    pages.push(page(body, { seq: 1 + s, granule: BigInt(s * RATE + PRE_SKIP), type: continued ? 1 : s === seconds ? 4 : 0, segs: Array(50 * 40 / 200).fill(200) }))
  }
  return Buffer.concat(pages)
}
const bodyBytes = (b: Buffer) => parseOgg(b).slice(2).reduce((n, p) => n + p.body.length, 0)

describe("the checksum and the reader", () => {
  it("reads every page, recognises Ogg, and the checksum of a built page verifies", () => {
    const s = makeStream(5); expect(isOgg(s)).toBe(true); expect(isOgg(Buffer.from("RIFF....WAVE"))).toBe(false)
    const pages = parseOgg(s); expect(pages).toHaveLength(7)
    for (const p of pages) { const full = Buffer.concat([p.header, p.body]); const stored = full.readUInt32LE(22); full.writeUInt32LE(0, 22); expect(oggCrc(full)).toBe(stored) }
  })
  it("refuses something that is not an Ogg stream, and a truncated one", () => {
    expect(() => parseOgg(Buffer.from("not ogg at all, definitely not"))).toThrow("not an Ogg stream")
    expect(() => parseOgg(makeStream(3).subarray(0, 100))).toThrow()
  })
  it("reports the length in seconds from the last time stamp less the pre-skip", () => { expect(oggInfo(makeStream(90)).seconds).toBe(90); expect(oggInfo(makeStream(2)).preSkip).toBe(PRE_SKIP) })
})

describe("splitOggOpus", () => {
  it("returns a short recording as it is", () => { const s = makeStream(100); expect(splitOggOpus(s, 240)).toEqual([s]) })
  it("cuts a long one into pieces that each fit, without losing or repeating any audio", () => {
    const s = makeStream(1000); const parts = splitOggOpus(s, 240)
    expect(parts.length).toBe(5)
    for (const p of parts) expect(oggInfo(p).seconds).toBeLessThanOrEqual(241)
    expect(parts.reduce((n, p) => n + bodyBytes(p), 0)).toBe(bodyBytes(s))
    const firstBytes = parts.flatMap((p) => parseOgg(p).slice(2).map((pg) => pg.body[0])); expect(firstBytes).toEqual(parseOgg(s).slice(2).map((pg) => pg.body[0]))
  })
  it("every piece is a valid stream on its own: headers first, pages renumbered from zero, checksums valid, time stamps rebased, the last page marked as the end", () => {
    const parts = splitOggOpus(makeStream(700), 240)
    parts.forEach((part) => {
      const pages = parseOgg(part)
      expect(pages[0].body.toString("latin1", 0, 8)).toBe("OpusHead"); expect(pages[0].type & 2).toBe(2); expect(pages[1].body.toString("latin1", 0, 8)).toBe("OpusTags")
      pages.forEach((p, i) => { expect(p.seq).toBe(i); const full = Buffer.concat([p.header, p.body]); const stored = full.readUInt32LE(22); full.writeUInt32LE(0, 22); expect(oggCrc(full)).toBe(stored) })
      expect(pages.at(-1)!.type & 4).toBe(4); expect(pages.slice(0, -1).every((p) => (p.type & 4) === 0)).toBe(true)
      expect(Number(pages[2].granule)).toBeLessThan(5 * RATE)                         // starts near zero, not at minutes in
      expect(oggInfo(part).seconds).toBeGreaterThan(0)
    })
    expect(parts.reduce((n, p) => n + oggInfo(p).seconds, 0)).toBeGreaterThanOrEqual(695); expect(parts.reduce((n, p) => n + oggInfo(p).seconds, 0)).toBeLessThanOrEqual(705)
  })
  it("never starts a piece on a page that continues a packet from the one before", () => {
    const s = makeStream(600, { spanAt: 241 }); const parts = splitOggOpus(s, 240)
    for (const part of parts.slice(1)) expect(parseOgg(part)[2].continued).toBe(false)
    expect(parts.reduce((n, p) => n + bodyBytes(p), 0)).toBe(bodyBytes(s))
  })
  it("refuses a stream that is not Ogg Opus", () => {
    expect(() => splitOggOpus(Buffer.from("RIFF0000WAVEfmt "))).toThrow()
    const bad = makeStream(3); bad.write("OpusXXXX", 28 + 1, "latin1"); expect(() => oggInfo(bad)).toThrow("not an Ogg Opus stream")
  })
  it("buildPage rewrites sequence, granule and flags and keeps the audio bytes", () => {
    const p = parseOgg(makeStream(3))[3]; const b = buildPage(p, { seq: 9, granule: BigInt(12345), type: 4 }); const q = parseOgg(b)[0]
    expect(q).toMatchObject({ seq: 9, type: 4 }); expect(q.granule).toBe(BigInt(12345)); expect(q.body.equals(p.body)).toBe(true)
  })
})

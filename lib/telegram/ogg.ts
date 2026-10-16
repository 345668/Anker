/**
 * Splitting a long Ogg/Opus recording into pieces the speech service can take (docs/architecture/57, T4). A Telegram voice note is always Ogg/Opus, and the speech service takes about
 * five minutes per request, so a long note is cut at page boundaries (never inside a packet), every piece gets the two header pages, its pages are renumbered, its time stamps are
 * rebased and its checksums recomputed, so each piece is a valid file on its own. Pure: bytes in, bytes out.
 */
export interface OggPage { header: Buffer; body: Buffer; type: number; granule: bigint; serial: number; seq: number; continued: boolean }

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let r = i << 24; for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; t[i] = r >>> 0 } return t })()
/** The Ogg page checksum: CRC-32 with polynomial 0x04C11DB7, no reflection, over the page with its checksum field zeroed. */
export function oggCrc(page: Buffer): number {
  let c = 0
  for (let i = 0; i < page.length; i++) c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ page[i]) & 0xff]) >>> 0
  return c >>> 0
}

export const isOgg = (b: Buffer) => b.length > 27 && b.toString("latin1", 0, 4) === "OggS"

export function parseOgg(b: Buffer): OggPage[] {
  const pages: OggPage[] = []
  let o = 0
  while (o < b.length) {
    if (b.length - o < 27 || b.toString("latin1", o, o + 4) !== "OggS") throw new Error("not an Ogg stream")
    const nseg = b[o + 26], hlen = 27 + nseg
    if (b.length - o < hlen) throw new Error("truncated Ogg page")
    let blen = 0
    for (let i = 0; i < nseg; i++) blen += b[o + 27 + i]
    if (b.length - o < hlen + blen) throw new Error("truncated Ogg page")
    pages.push({ header: Buffer.from(b.subarray(o, o + hlen)), body: Buffer.from(b.subarray(o + hlen, o + hlen + blen)), type: b[o + 5], granule: b.readBigInt64LE(o + 6), serial: b.readUInt32LE(o + 14), seq: b.readUInt32LE(o + 18), continued: (b[o + 5] & 1) === 1 })
    o += hlen + blen
  }
  return pages
}

/** Rebuilds one page with a new sequence number, granule position and flags, and a fresh checksum. */
export function buildPage(p: OggPage, o: { seq: number; granule: bigint; type: number }): Buffer {
  const out = Buffer.concat([p.header, p.body])
  out[5] = o.type & 0xff
  out.writeBigInt64LE(o.granule, 6)
  out.writeUInt32LE(o.seq, 18)
  out.writeUInt32LE(0, 22)
  out.writeUInt32LE(oggCrc(out), 22)
  return out
}

const RATE = BigInt(48000), ZERO = BigInt(0), NEG1 = BigInt(-1)
export interface OggInfo { seconds: number; preSkip: number }
/** The length of an Ogg/Opus recording in seconds, from the last page's time stamp and the pre-skip in its header. */
export function oggInfo(b: Buffer): OggInfo {
  const pages = parseOgg(b)
  if (pages.length < 3 || pages[0].body.toString("latin1", 0, 8) !== "OpusHead") throw new Error("not an Ogg Opus stream")
  const preSkip = pages[0].body.readUInt16LE(10)
  const last = pages.reduceRight((g, p) => (g >= ZERO ? g : p.granule), NEG1)
  return { seconds: Math.max(0, Number((last - BigInt(preSkip)) / RATE)), preSkip }
}

/** Cuts the recording into pieces of at most about `maxSeconds`. A recording that already fits comes back as one piece, unchanged. */
export function splitOggOpus(b: Buffer, maxSeconds = 240): Buffer[] {
  const pages = parseOgg(b)
  if (pages.length < 3 || pages[0].body.toString("latin1", 0, 8) !== "OpusHead") throw new Error("not an Ogg Opus stream")
  const info = oggInfo(b)
  if (info.seconds <= maxSeconds) return [b]
  const head = pages.slice(0, 2), audio = pages.slice(2)
  const maxSamples = BigInt(maxSeconds) * RATE
  const groups: OggPage[][] = []
  let cur: OggPage[] = [], start = ZERO
  for (const p of audio) {
    // A page that continues a packet from the one before cannot start a piece.
    if (cur.length && !p.continued && p.granule >= ZERO && p.granule - start > maxSamples) { groups.push(cur); start = cur[cur.length - 1].granule; cur = [] }
    cur.push(p)
  }
  if (cur.length) groups.push(cur)
  let end = BigInt(info.preSkip)               // the time stamp at which the previous piece ended
  const out: Buffer[] = []
  groups.forEach((g, gi) => {
    const parts: Buffer[] = []
    let seq = 0
    parts.push(buildPage(head[0], { seq: seq++, granule: head[0].granule, type: head[0].type }))
    parts.push(buildPage(head[1], { seq: seq++, granule: head[1].granule, type: head[1].type }))
    const base = gi === 0 ? ZERO : end - BigInt(info.preSkip)
    g.forEach((p, i) => {
      const last = i === g.length - 1
      const rebased = p.granule < ZERO ? p.granule : p.granule - base
      parts.push(buildPage(p, { seq: seq++, granule: rebased, type: (p.type & ~0x04 & ~0x02) | (last ? 0x04 : 0) }))
    })
    const lastP = g[g.length - 1]; if (lastP.granule >= ZERO) end = lastP.granule
    out.push(Buffer.concat(parts))
  })
  return out
}

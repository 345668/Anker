/**
 * Minimal ZIP — enough to write an archive of files (stored, no compression:
 * the .xlsx files inside are already compressed) and to read the entries of
 * Office documents (.pptx, .docx), which are ZIP containers. Node's zlib does
 * the inflating; no dependency.
 */
import { inflateRawSync } from "node:zlib"

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Build a ZIP (method 0, stored) from named files. Names are UTF-8. */
export function zipFiles(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8")
    const crc = crc32(f.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)          // version needed
    local.writeUInt16LE(0x0800, 6)      // UTF-8 names
    local.writeUInt16LE(0, 8)           // stored
    local.writeUInt32LE(0, 10)          // time/date
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(f.data.length, 18)
    local.writeUInt32LE(f.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    parts.push(local, name, f.data)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0x0800, 8)
    cd.writeUInt16LE(0, 10)
    cd.writeUInt32LE(0, 12)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(f.data.length, 20)
    cd.writeUInt32LE(f.data.length, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, name)
    offset += local.length + name.length + f.data.length
  }
  const cdBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cdBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cdBuf, end])
}

/**
 * Read a ZIP's entries by name through the central directory. Refuses
 * archives with more than `maxEntries` entries or entries that inflate beyond
 * `maxEntryBytes` (zip-bomb guard).
 */
export function unzipEntries(
  buf: Buffer,
  opts: { maxEntries?: number; maxEntryBytes?: number; filter?: (name: string) => boolean } = {},
): Map<string, Buffer> {
  const maxEntries = opts.maxEntries ?? 2000
  const maxEntryBytes = opts.maxEntryBytes ?? 20 * 1024 * 1024
  // End of central directory: scan back from the end (comment ≤ 64 KB).
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error("not a ZIP archive")
  const count = buf.readUInt16LE(eocd + 10)
  if (count > maxEntries) throw new Error(`archive has ${count} entries (limit ${maxEntries})`)
  let p = buf.readUInt32LE(eocd + 16)
  const out = new Map<string, Buffer>()
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt central directory")
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen
    if (opts.filter && !opts.filter(name)) continue
    if (size > maxEntryBytes) throw new Error(`entry ${name} is too large`)
    const lNameLen = buf.readUInt16LE(localOffset + 26), lExtraLen = buf.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + lNameLen + lExtraLen
    const data = buf.subarray(start, start + compSize)
    if (method === 0) out.set(name, Buffer.from(data))
    else if (method === 8) out.set(name, inflateRawSync(data, { maxOutputLength: maxEntryBytes }))
    else throw new Error(`unsupported compression method ${method} for ${name}`)
  }
  return out
}

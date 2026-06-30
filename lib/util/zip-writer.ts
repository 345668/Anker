/**
 * Tiny store-only ZIP writer (no compression, no third-party deps).
 *
 * Used by the bulk legal-document download to package 24 generated
 * docs into a single archive. .docx and .pdf are already compressed
 * containers internally — recompressing them gains nothing — and
 * Markdown packs small enough that store-only stays under typical
 * email/Slack attachment limits.
 *
 * Implements the PKZIP "store" method (deflate=0): per-entry local
 * file header + raw bytes, followed by the central directory and
 * EOCD record at the tail. Compatible with every unzip implementation
 * (macOS Finder, Windows Explorer, unzip(1), 7-Zip, JSZip).
 *
 * Spec reference: ECMA-376 / .ZIP Application Note 6.3.x §4.3.7,
 * §4.3.12, §4.3.16. Implemented without compression so the entire
 * writer stays in ~100 lines and ships zero runtime dependencies.
 */

import { createHash } from "node:crypto"

interface Entry {
  filename: string
  data: Uint8Array
  crc32: number
  size: number
  // Local file header offset (for the central directory).
  localHeaderOffset: number
}

export class ZipWriter {
  private entries: Entry[] = []
  private parts: Uint8Array[] = []
  private offset = 0

  add(filename: string, data: Uint8Array | Buffer | string): void {
    const bytes = typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : data
    const nameBytes = new TextEncoder().encode(filename)
    const crc = crc32(bytes)

    // Local file header (30 bytes + filename).
    const header = new Uint8Array(30 + nameBytes.length)
    const dv = new DataView(header.buffer)
    dv.setUint32(0, 0x04034b50, true)        // local file header signature
    dv.setUint16(4, 20, true)                // version needed (2.0)
    dv.setUint16(6, 0, true)                 // general purpose flag
    dv.setUint16(8, 0, true)                 // method = 0 (store)
    dv.setUint16(10, dosTime(), true)        // last mod file time
    dv.setUint16(12, dosDate(), true)        // last mod file date
    dv.setUint32(14, crc, true)              // CRC-32
    dv.setUint32(18, bytes.length, true)     // compressed size
    dv.setUint32(22, bytes.length, true)     // uncompressed size
    dv.setUint16(26, nameBytes.length, true) // filename length
    dv.setUint16(28, 0, true)                // extra field length
    header.set(nameBytes, 30)

    this.entries.push({
      filename, data: bytes, crc32: crc, size: bytes.length,
      localHeaderOffset: this.offset,
    })
    this.parts.push(header)
    this.parts.push(bytes)
    this.offset += header.length + bytes.length
  }

  finalize(): Uint8Array {
    const centralDirParts: Uint8Array[] = []
    const cdStart = this.offset

    for (const e of this.entries) {
      const nameBytes = new TextEncoder().encode(e.filename)
      const cd = new Uint8Array(46 + nameBytes.length)
      const dv = new DataView(cd.buffer)
      dv.setUint32(0, 0x02014b50, true)            // central dir signature
      dv.setUint16(4, 20, true)                    // version made by
      dv.setUint16(6, 20, true)                    // version needed
      dv.setUint16(8, 0, true)                     // gp flag
      dv.setUint16(10, 0, true)                    // method
      dv.setUint16(12, dosTime(), true)            // time
      dv.setUint16(14, dosDate(), true)            // date
      dv.setUint32(16, e.crc32, true)              // crc
      dv.setUint32(20, e.size, true)               // compressed size
      dv.setUint32(24, e.size, true)               // uncompressed size
      dv.setUint16(28, nameBytes.length, true)     // filename length
      dv.setUint16(30, 0, true)                    // extra length
      dv.setUint16(32, 0, true)                    // comment length
      dv.setUint16(34, 0, true)                    // disk number
      dv.setUint16(36, 0, true)                    // internal attrs
      dv.setUint32(38, 0, true)                    // external attrs
      dv.setUint32(42, e.localHeaderOffset, true)  // relative offset
      cd.set(nameBytes, 46)
      centralDirParts.push(cd)
    }
    const cdBytes = concat(centralDirParts)
    const cdSize = cdBytes.length

    // End-of-central-directory record (22 bytes).
    const eocd = new Uint8Array(22)
    const dv = new DataView(eocd.buffer)
    dv.setUint32(0, 0x06054b50, true)            // EOCD signature
    dv.setUint16(4, 0, true)                     // disk number
    dv.setUint16(6, 0, true)                     // disk with CD start
    dv.setUint16(8, this.entries.length, true)   // entries on this disk
    dv.setUint16(10, this.entries.length, true)  // entries total
    dv.setUint32(12, cdSize, true)               // central directory size
    dv.setUint32(16, cdStart, true)              // central directory offset
    dv.setUint16(20, 0, true)                    // comment length

    return concat([...this.parts, cdBytes, eocd])
  }
}

// ─── helpers ────────────────────────────────────────────────────────────

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) { out.set(p, off); off += p.length }
  return out
}

/** CRC-32 (IEEE 802.3, init 0xFFFFFFFF, XOR-out 0xFFFFFFFF). Table-
 *  driven so we only compute the lookup table once per process. */
let CRC_TABLE: Uint32Array | null = null
function crc32(buf: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// DOS time/date for archive entries — use current time, but archive
// readers don't care about precision.
function dosTime(): number {
  const d = new Date()
  return ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >>> 1) & 0x1f)
}
function dosDate(): number {
  const d = new Date()
  return (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | (d.getDate() & 0x1f)
}

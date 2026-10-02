/** Doc 36 — chat attachments past the hosted request-size limit. */
import { describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { Document, Packer, Paragraph } from "docx"
import {
  attachmentError, attachmentPrefix, needsBlob, parseBlobRefs, INLINE_MAX_BYTES, BLOB_MAX_BYTES,
} from "./attachment-limits"
import { assistantUploads } from "./uploads"

const MB = 1024 * 1024
const f = (name: string, size: number) => ({ name, size })

describe("attachment limits", () => {
  it("sends small sets inline and larger ones through Blob", () => {
    expect(needsBlob([f("a.pdf", INLINE_MAX_BYTES)])).toBe(false)
    expect(needsBlob([f("a.pdf", INLINE_MAX_BYTES + 1)])).toBe(true)
    expect(needsBlob([f("a.pdf", 2 * MB), f("b.pdf", 2 * MB)])).toBe(true)
  })
  it("accepts a 10 MB PDF and a Word file, which the old 5 MB / no-Word rule refused", () => {
    expect(attachmentError([f("deck.pdf", 10 * MB), f("memo.docx", 1 * MB)])).toBeNull()
  })
  it("refuses empty, oversized, unsupported and too many files", () => {
    expect(attachmentError([f("a.pdf", 0)])).toMatch(/empty/)
    expect(attachmentError([f("a.pdf", BLOB_MAX_BYTES + 1)])).toMatch(/25 MB/)
    expect(attachmentError([f("a.exe", 10)])).toMatch(/Supported files/)
    expect(attachmentError(Array.from({ length: 6 }, (_, i) => f(`${i}.pdf`, 10)))).toMatch(/at most 5/)
    expect(attachmentError(Array.from({ length: 5 }, (_, i) => f(`${i}.pdf`, 9 * MB)))).toMatch(/40 MB/)
  })
  it("derives a path prefix a scope key cannot escape", () => {
    expect(attachmentPrefix("org:1234")).toBe("assistant-uploads/org-1234/")
    expect(attachmentPrefix("../x/org:1")).toBe("assistant-uploads/---x-org-1/")
  })
  it("shapes untrusted blob references", () => {
    expect(parseBlobRefs(JSON.stringify([{ url: "https://x/y", name: "a.pdf" }, { url: 5 }, null]))).toEqual([{ url: "https://x/y", name: "a.pdf" }])
    expect(parseBlobRefs("not json")).toEqual([])
    expect(parseBlobRefs({ url: "x" })).toEqual([])
    expect(parseBlobRefs(Array.from({ length: 20 }, () => ({ url: "https://x/y" })))).toHaveLength(5)
  })
})

describe("assistantUploads", () => {
  it("reads a Word file as text", async () => {
    const buf = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Term sheet draft"), new Paragraph("Valuation cap 12m")] }] }))
    const file = new File([new Uint8Array(buf)], "terms.docx")
    const out = await assistantUploads([file])
    expect(out.processed).toEqual([{ name: "terms.docx", kind: "docx" }])
    expect(out.text).toContain("Term sheet draft")
    expect(out.text).toContain("Valuation cap 12m")
  })
  it("refuses a blob under another workspace's prefix, before reading it", async () => {
    const url = "https://store.private.blob.vercel-storage.com/assistant-uploads/org-OTHER/abc/deck.pdf"
    await expect(assistantUploads([], [{ url, name: "deck.pdf" }], "org:MINE")).rejects.toMatchObject({ status: 403 })
  })
  it("refuses a non-URL blob reference", async () => {
    await expect(assistantUploads([], [{ url: "nope", name: "a.pdf" }], "org:MINE")).rejects.toMatchObject({ status: 400 })
  })
  it("refuses an oversized inline body with a 413 the client can explain", async () => {
    const big = new File([new Uint8Array(6 * MB)], "big.pdf")
    await expect(assistantUploads([big])).rejects.toMatchObject({ status: 413 })
  })
})

import { sweepStaleUploads, STALE_AFTER_MS } from "./upload-sweep"
import { audioMime } from "./transcribe"
import { legacyDocText } from "../files/legacy-word"

describe("stale upload sweep", () => {
  const now = Date.parse("2026-10-02T12:00:00Z")
  const blob = (url: string, ageMs: number) => ({ url, uploadedAt: new Date(now - ageMs) })
  it("deletes only blobs older than the cutoff, across pages", async () => {
    const pages = [
      { blobs: [blob("a", STALE_AFTER_MS + 1), blob("b", 60_000)], cursor: "c1", hasMore: true },
      { blobs: [blob("c", STALE_AFTER_MS * 3)], hasMore: false },
    ]
    const deleted: string[] = []
    let i = 0
    const out = await sweepStaleUploads({ list: async () => pages[i++], del: async (u) => { deleted.push(...u) } }, now)
    expect(deleted).toEqual(["a", "c"])
    expect(out).toEqual({ scanned: 3, deleted: 2 })
  })
  it("does nothing for an empty store", async () => {
    const out = await sweepStaleUploads({ list: async () => ({ blobs: [], hasMore: false }), del: async () => { throw new Error("no") } }, now)
    expect(out).toEqual({ scanned: 0, deleted: 0 })
  })
})

describe("audio and legacy Word", () => {
  it("maps audio extensions to MIME types and refuses unknown ones", () => {
    expect(audioMime("call.MP3")).toBe("audio/mpeg")
    expect(audioMime("memo.m4a")).toBe("audio/mp4")
    expect(audioMime("deck.pdf")).toBeNull()
  })
  it("accepts audio and .doc in the attachment rules, with a 7 MB audio cap", () => {
    expect(attachmentError([f("call.mp3", 5 * MB), f("old.doc", MB)])).toBeNull()
    expect(attachmentError([f("long.mp3", 8 * MB)])).toMatch(/5 minutes/)
  })
  it("rejects bytes that are not a Word document", async () => {
    await expect(legacyDocText(Buffer.from("not a word file"))).rejects.toBeTruthy()
  })
})

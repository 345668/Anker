import { describe, it, expect } from "vitest"
import { isPendingBlobUrl, parseBlobUrls, nameFromBlobUrl } from "./submission-files"

const good = "https://abc123.private.blob.vercel-storage.com/founder-submissions/pending/uuid/deck-xyz.pdf"
describe("pending blob URLs", () => {
  it("accepts only our store's pending folder over https", () => {
    expect(isPendingBlobUrl(good)).toBe(true)
    expect(isPendingBlobUrl("https://evil.example.com/founder-submissions/pending/a.pdf")).toBe(false)
    expect(isPendingBlobUrl("https://abc.private.blob.vercel-storage.com/founder-submissions/REF/deck.pdf")).toBe(false)
    expect(isPendingBlobUrl("http://abc.private.blob.vercel-storage.com/founder-submissions/pending/a.pdf")).toBe(false)
    expect(isPendingBlobUrl("https://abc.private.blob.vercel-storage.com/founder-submissions/pending/../x/a.pdf".replace("/../", "/%2e%2e/"))).toBe(false)
    expect(isPendingBlobUrl(42)).toBe(false)
  })
  it("filters a list, caps it, and reads names", () => {
    expect(parseBlobUrls(JSON.stringify([good, "nope"]))).toEqual([good])
    expect(parseBlobUrls("{")).toEqual([])
    expect(nameFromBlobUrl(good)).toBe("deck-xyz.pdf")
  })
})

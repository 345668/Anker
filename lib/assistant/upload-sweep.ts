/**
 * Remove chat-attachment blobs nobody read (docs/architecture/36). A blob is normally
 * deleted the moment the chat route reads it; one is left behind only when someone
 * attaches a file and never sends the message. Anything older than the cutoff is
 * deleted — far longer than the ten-minute upload token and any real send.
 */
export const UPLOAD_PREFIX = "assistant-uploads/"
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000

export interface BlobListing { blobs: { url: string; uploadedAt: Date | string }[]; cursor?: string; hasMore: boolean }
export interface SweepDeps {
  list: (opts: { prefix: string; cursor?: string; limit: number }) => Promise<BlobListing>
  del: (urls: string[]) => Promise<void>
}

export async function sweepStaleUploads(deps: SweepDeps, now = Date.now(), maxPages = 20): Promise<{ scanned: number; deleted: number }> {
  let cursor: string | undefined
  let scanned = 0, deleted = 0
  for (let page = 0; page < maxPages; page++) {
    const r = await deps.list({ prefix: UPLOAD_PREFIX, cursor, limit: 500 })
    scanned += r.blobs.length
    const stale = r.blobs.filter((b) => now - new Date(b.uploadedAt).getTime() > STALE_AFTER_MS).map((b) => b.url)
    if (stale.length) { await deps.del(stale); deleted += stale.length }
    if (!r.hasMore || !r.cursor) break
    cursor = r.cursor
  }
  return { scanned, deleted }
}

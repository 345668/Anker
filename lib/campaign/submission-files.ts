/**
 * Founder-application files that bypass the hosted request limit (docs/architecture/36 §/apply).
 *
 * /apply used to post the deck inside the multipart form to /api/public/submit, so anything
 * above ~4.5 MB was refused by the platform with a 413 although the page promised 25 MB.
 * The browser now uploads straight to private Blob under `founder-submissions/pending/` and
 * the form carries only the URLs. The route is anonymous, so the token is narrow: fixed
 * prefix, document types only, 25 MB, ten minutes, and the token route is rate limited.
 */
export const PENDING_PREFIX = "founder-submissions/pending/"
export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const MAX_DATAROOM_FILES = 8
/** Below this the form is sent as before, with the files inline. */
export const INLINE_TOTAL_BYTES = 3 * 1024 * 1024

export const DECK_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
]
export const DATA_ROOM_TYPES = [
  ...DECK_TYPES,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
]

/** A URL the browser claims it uploaded. Only our own store's pending folder is accepted, so
 *  a forged link can neither point the server at another host nor at another workspace's file. */
export function isPendingBlobUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2048) return false
  let u: URL
  try { u = new URL(raw) } catch { return false }
  return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com")
    && decodeURIComponent(u.pathname.replace(/^\//, "")).startsWith(PENDING_PREFIX)
    && !decodeURIComponent(u.pathname).split("/").includes("..")
}

export function parseBlobUrls(input: unknown): string[] {
  let v: unknown = input
  if (typeof v === "string") { try { v = JSON.parse(v) } catch { return [] } }
  return Array.isArray(v) ? v.filter(isPendingBlobUrl).slice(0, MAX_DATAROOM_FILES) : []
}

export const nameFromBlobUrl = (url: string) => {
  const last = decodeURIComponent(new URL(url).pathname).split("/").pop() ?? "file"
  return last.slice(0, 200)
}

/** Where an admin-attached deck lives: the submission's own folder. The server derives it
 *  from the record, never from the request. */
export const deckPrefix = (publicRef: string) => `founder-submissions/${publicRef}/`

/** A blob URL the admin console claims it uploaded for this submission. */
export function isDeckBlobUrl(raw: unknown, publicRef: string): raw is string {
  if (typeof raw !== "string" || raw.length > 2048) return false
  let u: URL
  try { u = new URL(raw) } catch { return false }
  const path = decodeURIComponent(u.pathname)
  return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com")
    && path.replace(/^\//, "").startsWith(deckPrefix(publicRef)) && !path.split("/").includes("..")
}

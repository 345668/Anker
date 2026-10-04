/** Files for fund intake: where the browser may upload a deck, and which URLs the server will accept back. */
import { MAX_DOCUMENT_BYTES } from "@/lib/uploads/limits"

export const INTAKE_PENDING_PREFIX = "intake-submissions/pending/"
export const INTAKE_DECK_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
]
export const INTAKE_MAX_BYTES = MAX_DOCUMENT_BYTES

/** A URL the browser claims it uploaded: only our own store, only the intake pending folder, no path tricks. */
export function isIntakeBlobUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2048) return false
  let u: URL
  try { u = new URL(raw) } catch { return false }
  const path = decodeURIComponent(u.pathname.replace(/^\//, ""))
  return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com") && path.startsWith(INTAKE_PENDING_PREFIX) && !path.split("/").includes("..")
}

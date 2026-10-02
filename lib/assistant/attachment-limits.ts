/** Chat attachment limits and file-type rules, shared by client and server (doc 36). */

/** Multipart bodies stay under the hosted function request limit (~4.5 MB) with room for
 *  the prompt and encoding overhead. Anything larger goes through Vercel Blob. */
export const INLINE_MAX_BYTES = 3 * 1024 * 1024
export const BLOB_MAX_BYTES = 25 * 1024 * 1024
export const TOTAL_MAX_BYTES = 40 * 1024 * 1024
export const MAX_ATTACHMENTS = 5

export const ATTACHMENT_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".md", ".csv", ".json", ".tsv"] as const
export const ATTACHMENT_ACCEPT = ATTACHMENT_EXTENSIONS.join(",")
export const ATTACHMENT_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png", "image/jpeg", "image/webp",
  "text/plain", "text/markdown", "text/csv", "text/tab-separated-values", "application/json",
]

export const isAcceptedAttachment = (name: string) => ATTACHMENT_EXTENSIONS.some((e) => name.toLowerCase().endsWith(e))

/** Where a workspace's uploads live. The server derives this from the principal; the
 *  client derives it from the scope key it was given, so a forged scope fails the check. */
export const attachmentPrefix = (scopeKey: string) => `assistant-uploads/${scopeKey.replace(/[^A-Za-z0-9_-]/g, "-")}/`

export interface BlobRef { url: string; name: string }

/** First problem with a prospective set of attachments, or null. */
export function attachmentError(files: { name: string; size: number }[]): string | null {
  if (files.length > MAX_ATTACHMENTS) return `Attach at most ${MAX_ATTACHMENTS} files.`
  if (files.some((f) => f.size === 0)) return "One of the files is empty."
  if (files.some((f) => !isAcceptedAttachment(f.name))) return "Supported files: PDF, Word, Excel, images (PNG, JPEG, WebP) and text, Markdown, CSV or JSON."
  if (files.some((f) => f.size > BLOB_MAX_BYTES)) return "Each file must be under 25 MB."
  if (files.reduce((n, f) => n + f.size, 0) > TOTAL_MAX_BYTES) return "Keep the attachments under 40 MB in total."
  return null
}
export const needsBlob = (files: { size: number }[]) => files.reduce((n, f) => n + f.size, 0) > INLINE_MAX_BYTES

/** Blob references arrive from the client, so they are shaped here, not trusted. Accepts the
 *  parsed array or a JSON string (multipart). */
export function parseBlobRefs(input: unknown): BlobRef[] {
  let v: unknown = input
  if (typeof v === "string") { try { v = JSON.parse(v) } catch { return [] } }
  if (!Array.isArray(v)) return []
  return v.slice(0, MAX_ATTACHMENTS).flatMap((r) =>
    r && typeof r.url === "string" && r.url.length < 2048 ? [{ url: r.url, name: String(r.name ?? "").slice(0, 200) }] : [])
}

/** Deck upload limits and file-type rules, shared by the client and the route. */

// Multipart bodies must stay under the hosted function request limit, including
// encoding overhead. Bigger decks go through Vercel Blob (docs/architecture/14 §8).
export const MAX_DECK_BYTES = 4 * 1024 * 1024
/** Blob-upload ceiling for a single deck. */
export const MAX_BLOB_BYTES = 25 * 1024 * 1024
export const MAX_DECK_FILES = 5
/** Extensions accepted directly; PPTX and DOCX are read as Office XML, no PDF export needed. */
export const DECK_EXTENSIONS = [".pdf", ".pptx", ".docx", ".txt", ".md", ".csv", ".json"] as const

export function isAcceptedDeckFile(name: string): boolean {
  return DECK_EXTENSIONS.some((e) => name.toLowerCase().endsWith(e))
}

export function deckUploadError(files: { name: string; size: number }[], opts: { viaBlob?: boolean } = {}): string | null {
  const cap = opts.viaBlob ? MAX_BLOB_BYTES : MAX_DECK_BYTES
  if (!files.length) return "Upload a deck or supporting document first."
  if (files.length > MAX_DECK_FILES) return "Upload at most five files per extraction."
  if (files.some((f) => f.size === 0)) return "An uploaded file is empty. Choose a file with content."
  if (files.some((f) => !isAcceptedDeckFile(f.name))) return "Use PDF, PowerPoint, Word, TXT, Markdown, CSV or JSON files."
  if (files.reduce((sum, f) => sum + f.size, 0) > cap) {
    return opts.viaBlob ? "Keep each deck below 25 MB." : "Keep the combined upload below 4 MB, or let the browser upload the deck directly."
  }
  return null
}

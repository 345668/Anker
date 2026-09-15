// Keep multipart bodies below the hosted function request limit, including encoding overhead.
export const MAX_DECK_BYTES = 4 * 1024 * 1024
export const MAX_DECK_FILES = 5
export function deckUploadError(files: { name: string; size: number }[]): string | null {
  if (!files.length) return "Upload a deck or supporting document first."
  if (files.length > MAX_DECK_FILES) return "Upload at most five files per extraction."
  if (files.some(f => f.size === 0)) return "An uploaded file is empty. Choose a file with content."
  if (files.some(f => !/\.(pdf|txt|md|csv|json)$/i.test(f.name))) return "Use PDF, TXT, Markdown, CSV or JSON files. Export PowerPoint decks to PDF first."
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_DECK_BYTES) return "Keep the combined upload below 4 MB. Compress the PDF or upload fewer files."
  return null
}

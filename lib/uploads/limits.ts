/**
 * Upload ceilings for documents that go straight to private Blob (the browser uploads, the server only authorises).
 * Pitch decks routinely run 20 to 80 MB when they carry full-bleed photos, so the ceiling for decks and data-room
 * documents is 100 MB, and a PDF above it is compressed in the browser before upload (lib/pdf/compress.ts).
 * The founder-campaign form (/apply) keeps its own 25 MB limit.
 */
export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024
/** A deck above this is not read automatically on the server (memory and time); the form answers carry the assessment. */
export const MAX_AUTO_READ_BYTES = 40 * 1024 * 1024
export const humanBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/** Exact-layout conversion: where the browser uploads the file, which URLs the server will take back, and what each direction accepts. */
export const CONVERT_MAX_BYTES = 25 * 1024 * 1024
export const convertPrefix = (scopeKey: string) => `tools-convert/${scopeKey.replace(/[^A-Za-z0-9_-]/g, "-")}/`
export const CONVERT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf", "text/rtf",
  "application/octet-stream", // some browsers send nothing useful for .doc and .rtf
]

export type Direction = "word-to-pdf" | "pdf-to-word"
const ACCEPT: Record<Direction, { ext: string[]; format: "pdf" | "docx" }> = {
  "word-to-pdf": { ext: ["doc", "docx", "odt", "rtf"], format: "pdf" },
  "pdf-to-word": { ext: ["pdf"], format: "docx" },
}

/** What the worker should produce for this direction, or an error if the file is the wrong kind. */
export function planConvert(direction: unknown, filename: unknown): { format: "pdf" | "docx"; ext: string } | { error: string } {
  if (direction !== "word-to-pdf" && direction !== "pdf-to-word") return { error: "Unknown conversion." }
  const ext = String(filename ?? "").split(".").pop()?.toLowerCase() ?? ""
  const rule = ACCEPT[direction]
  if (!rule.ext.includes(ext)) return { error: direction === "word-to-pdf" ? "Please choose a Word document (.doc, .docx), .odt or .rtf file." : "Please choose a PDF file." }
  return { format: rule.format, ext }
}

/** A blob URL the browser claims it uploaded: our store, this caller's own folder, no path tricks. */
export function isConvertBlobUrl(raw: unknown, scopeKey: string): raw is string {
  if (typeof raw !== "string" || raw.length > 2048) return false
  let u: URL
  try { u = new URL(raw) } catch { return false }
  const path = decodeURIComponent(u.pathname.replace(/^\//, ""))
  return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com") && path.startsWith(convertPrefix(scopeKey)) && !path.split("/").includes("..")
}

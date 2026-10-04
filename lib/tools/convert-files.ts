/** Exact-layout conversion: where the browser uploads the file, which URLs the server will take back, and what each direction accepts. */
export const CONVERT_MAX_BYTES = 25 * 1024 * 1024
export const convertPrefix = (scopeKey: string) => `tools-convert/${scopeKey.replace(/[^A-Za-z0-9_-]/g, "-")}/`
export const CONVERT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf", "text/rtf",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.oasis.opendocument.spreadsheet", "text/csv",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.oasis.opendocument.presentation",
  "application/octet-stream", // some browsers send nothing useful for .doc and .rtf
]

export type Direction = "word-to-pdf" | "pdf-to-word" | "excel-to-pdf" | "powerpoint-to-pdf" | "scan-to-word"
const ACCEPT: Record<Direction, { ext: string[]; format: "pdf" | "docx" }> = {
  "word-to-pdf": { ext: ["doc", "docx", "odt", "rtf"], format: "pdf" },
  "pdf-to-word": { ext: ["pdf"], format: "docx" },
  "scan-to-word": { ext: ["pdf"], format: "docx" },
  "excel-to-pdf": { ext: ["xls", "xlsx", "ods", "csv"], format: "pdf" },
  "powerpoint-to-pdf": { ext: ["ppt", "pptx", "odp"], format: "pdf" },
}

/** What the worker should produce for this direction, or an error if the file is the wrong kind. */
export function planConvert(direction: unknown, filename: unknown): { format: "pdf" | "docx"; ext: string } | { error: string } {
  if (typeof direction !== "string" || !Object.hasOwn(ACCEPT, direction)) return { error: "Unknown conversion." }
  const ext = String(filename ?? "").split(".").pop()?.toLowerCase() ?? ""
  const rule = ACCEPT[direction as Direction]
  if (!rule.ext.includes(ext)) return { error: ({ "word-to-pdf": "Please choose a Word document (.doc, .docx), .odt or .rtf file.", "pdf-to-word": "Please choose a PDF file.", "scan-to-word": "Please choose a PDF file.", "excel-to-pdf": "Please choose a spreadsheet (.xlsx, .xls, .ods or .csv).", "powerpoint-to-pdf": "Please choose a presentation (.pptx, .ppt or .odp)." } as Record<Direction, string>)[direction as Direction] }
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

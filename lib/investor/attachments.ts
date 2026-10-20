/** File checks for message attachments (docs/architecture/72). A screen for common risks, not a virus scanner. */
import { createHash } from "node:crypto"
import { InvestorError } from "./profile"

export const MAX_FILES = 3, MAX_FILE_BYTES = 4 * 1024 * 1024, MAX_TOTAL_BYTES = 25 * 1024 * 1024
export interface UploadedFile { filename: string; bytes: Buffer }
export interface CheckedFile { filename: string; contentType: string; bytes: Buffer; sha256: string }

/** What the file is, read from its first bytes. */
export function sniff(bytes: Buffer): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf"
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png"
  return null
}
const ACTIVE = /\/(JavaScript|JS|Launch|EmbeddedFile|EmbeddedFiles|RichMedia|XFA|OpenAction|AA|SubmitForm|ImportData)(?![A-Za-z])/
const DISGUISED = /\/[A-Za-z]{0,24}#[0-9A-Fa-f]{2}/
/** Why a PDF is refused, or null. */
export function pdfRisk(bytes: Buffer): string | null {
  const text = bytes.toString("latin1")
  if (ACTIVE.test(text)) return "it contains active content (scripts, actions or embedded files)"
  if (DISGUISED.test(text)) return "it uses unusual encoding that can hide active content"
  return null
}
export const safeName = (n: string) => n.replace(/[\r\n"\\/<>:*?|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 150) || "document"

export function checkFiles(files: UploadedFile[]): CheckedFile[] {
  if (files.length > MAX_FILES) throw new InvestorError(`Attach at most ${MAX_FILES} files to a message.`, 400, "too_many")
  let total = 0
  return files.map((f) => {
    if (!f.bytes.length) throw new InvestorError(`${safeName(f.filename)} is empty.`, 400, "empty")
    if (f.bytes.length > MAX_FILE_BYTES) throw new InvestorError(`${safeName(f.filename)} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`, 413, "too_large")
    total += f.bytes.length
    const type = sniff(f.bytes)
    if (!type) throw new InvestorError(`${safeName(f.filename)}: please send a PDF, JPEG or PNG file.`, 415, "type")
    if (type === "application/pdf") { const risk = pdfRisk(f.bytes); if (risk) throw new InvestorError(`${safeName(f.filename)} was not accepted: ${risk}.`, 422, "unsafe") }
    return { filename: safeName(f.filename), contentType: type, bytes: f.bytes, sha256: createHash("sha256").update(f.bytes).digest("hex") }
  })
}

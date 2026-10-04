/** Browser side of the exact-layout converter: upload straight to private storage, ask the server to convert, receive the file. */
import { CONVERT_MAX_BYTES, type Direction } from "./convert-files"
import { humanBytes } from "@/lib/uploads/limits"

export async function exactAvailable(): Promise<{ available: boolean; prefix: string }> {
  try { const r = await fetch("/api/tools/convert", { cache: "no-store" }); const d = r.ok ? await r.json() : null; return { available: !!d?.available, prefix: String(d?.prefix ?? "") } } catch { return { available: false, prefix: "" } }
}

export async function convertExact(file: File, direction: Direction, prefix: string): Promise<File> {
  if (file.size > CONVERT_MAX_BYTES) throw new Error(`${file.name} is ${humanBytes(file.size)}. The exact-layout converter takes files up to ${humanBytes(CONVERT_MAX_BYTES)}; use the in-browser option, or shrink the file first.`)
  const { upload } = await import("@vercel/blob/client")
  // `prefix` is the caller's own folder, handed out by the server; the token route enforces it again.
  const blob = await upload(`${prefix}${crypto.randomUUID()}/${file.name.replace(/[^\w.\- ]/g, "_")}`, file, { access: "private" as any, handleUploadUrl: "/api/tools/convert-upload", contentType: file.type || "application/octet-stream" })
  const res = await fetch("/api/tools/convert", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ direction, blobUrl: blob.url, filename: file.name }) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `The converter answered ${res.status}.`)
  const out = await res.blob()
  const name = (res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1]) || file.name.replace(/\.[^.]+$/, "") + (direction === "word-to-pdf" ? ".pdf" : ".docx")
  return new File([out], name, { type: out.type })
}

/**
 * Read the documents an extraction request carries (docs/architecture/14 §8):
 *
 *   pitch_deck / data_room   multipart files (≤ 4 MB total)
 *   blob_urls                decks the browser uploaded straight to Vercel Blob
 *                            (private, ≤ 25 MB each, this workspace's prefix only)
 *   deck_url                 a link to a PDF or a web page (SSRF-guarded)
 *
 * PDFs are passed through as base64 for the vision chain; PowerPoint and Word
 * are read as Office XML; web pages through Readability. Blobs are deleted
 * once read.
 */
import { deckUploadError, isAcceptedDeckFile, MAX_BLOB_BYTES } from "./deck-upload"
import { MatchingError } from "./access"
import { pptxText, docxText } from "@/lib/files/office-text"
import { safeFetch, UnsafeUrlError } from "@/lib/net/safe-fetch"
import { extractText } from "@/lib/admin/web-crawler"

export interface DeckFile {
  name: string
  contentType: string
  base64: string
  text?: string
}

export const blobPrefix = (orgId: string) => `founder-decks/${orgId}/`

function fromBuffer(name: string, buffer: Buffer): DeckFile {
  const lower = name.toLowerCase()
  if (lower.endsWith(".pdf")) {
    if (buffer.subarray(0, 5).toString() !== "%PDF-") throw new MatchingError(`${name} is not a valid PDF.`, 422)
    return { name, contentType: "application/pdf", base64: buffer.toString("base64") }
  }
  if (lower.endsWith(".pptx")) {
    const { text, slides } = pptxText(buffer)
    if (!text.trim()) throw new MatchingError(`${name} has no readable text. Export it to PDF and try again.`, 422)
    return { name, contentType: "text/plain", base64: "", text: `[PowerPoint, ${slides} slides]\n${text}`.slice(0, 200_000) }
  }
  if (lower.endsWith(".docx")) {
    const { text } = docxText(buffer)
    if (!text.trim()) throw new MatchingError(`${name} has no readable text.`, 422)
    return { name, contentType: "text/plain", base64: "", text: text.slice(0, 200_000) }
  }
  return { name, contentType: "text/plain", base64: "", text: buffer.toString("utf8").slice(0, 200_000) }
}

async function readBlob(url: string, orgId: string): Promise<DeckFile> {
  const { get, del } = await import("@vercel/blob")
  let pathname: string
  try { pathname = new URL(url).pathname.replace(/^\//, "") } catch { throw new MatchingError("That upload link is not valid.", 400) }
  if (!pathname.startsWith(blobPrefix(orgId))) throw new MatchingError("That upload belongs to another workspace.", 403)
  const blob = await get(url, { access: "private" }).catch(() => null)
  if (!blob || blob.statusCode !== 200 || !blob.stream) throw new MatchingError("That upload could not be read. Try again.", 404)
  const chunks: Buffer[] = []
  let size = 0
  const reader = blob.stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BLOB_BYTES) { await reader.cancel(); throw new MatchingError("That upload is larger than 25 MB.", 413) }
    chunks.push(Buffer.from(value))
  }
  const name = decodeURIComponent(pathname.split("/").pop() ?? "deck.pdf")
  const file = fromBuffer(name, Buffer.concat(chunks))
  // The deck is confidential: it exists in blob storage only until it is read.
  await del(url).catch((e) => console.warn("[deck-upload] blob not deleted:", e?.message ?? e))
  return file
}

async function readUrl(input: string): Promise<DeckFile> {
  try {
    const { finalUrl, contentType, body } = await safeFetch(input, { maxBytes: MAX_BLOB_BYTES, timeoutMs: 20_000 })
    const name = decodeURIComponent(new URL(finalUrl).pathname.split("/").pop() || "deck")
    if (contentType.includes("pdf") || body.subarray(0, 5).toString() === "%PDF-") {
      return { name: name.endsWith(".pdf") ? name : `${name}.pdf`, contentType: "application/pdf", base64: body.toString("base64") }
    }
    if (contentType.includes("html") || body.subarray(0, 200).toString().toLowerCase().includes("<html")) {
      const text = extractText(body.toString("utf8"), finalUrl)
      if (text.trim().length < 200) {
        throw new MatchingError("That page has almost no readable text — many deck viewers require a sign-in. Download the deck and upload the file.", 422)
      }
      return { name: name || "deck-page", contentType: "text/plain", base64: "", text: text.slice(0, 200_000) }
    }
    throw new MatchingError("That link is not a PDF or a readable page.", 422)
  } catch (e) {
    if (e instanceof UnsafeUrlError) throw new MatchingError(e.message, 400)
    throw e
  }
}

export async function readDeckUpload(req: Request, opts: { orgId?: string } = {}) {
  const form = await req.formData()
  const deck = form.get("pitch_deck")
  const documents = form.getAll("data_room")
  if ((deck && !(deck instanceof File)) || documents.some((f) => !(f instanceof File))) throw new MatchingError("Invalid file upload.", 400)
  const files = [...(deck ? [deck as File] : []), ...(documents as File[])]

  const parsed: DeckFile[] = []
  if (files.length) {
    const error = deckUploadError(files)
    if (error) throw new MatchingError(error, 422)
    for (const file of files) parsed.push(fromBuffer(file.name, Buffer.from(await file.arrayBuffer())))
  }

  const blobUrls = form.getAll("blob_urls").filter((v): v is string => typeof v === "string").slice(0, 5)
  if (blobUrls.length) {
    if (!opts.orgId) throw new MatchingError("Select a workspace before uploading.", 403)
    for (const url of blobUrls) parsed.push(await readBlob(url, opts.orgId))
  }

  const deckUrl = form.get("deck_url")
  if (typeof deckUrl === "string" && deckUrl.trim()) parsed.push(await readUrl(deckUrl.trim()))

  if (!parsed.length) throw new MatchingError("Upload a deck, paste a link, or add a supporting document.", 422)
  for (const f of parsed) {
    if (!isAcceptedDeckFile(f.name) && f.contentType !== "text/plain") throw new MatchingError(`${f.name} is not an accepted file type.`, 422)
  }
  return { form, pitchDeck: parsed[0], dataRoom: parsed.slice(1) }
}

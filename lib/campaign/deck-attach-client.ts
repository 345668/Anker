"use client"
/**
 * Browser side of "attach / replace deck" (docs/architecture/36). Small files go as before;
 * anything above the hosted request limit is uploaded straight to Blob and then recorded.
 * Throws an Error whose message is fit to show.
 */
import { deckPrefix, MAX_FILE_BYTES } from "./submission-files"

const INLINE_MAX = 3 * 1024 * 1024

export async function attachDeckFile(endpoint: string, publicRef: string, file: File): Promise<void> {
  if (file.size === 0) throw new Error("That file is empty.")
  if (file.size > MAX_FILE_BYTES) throw new Error("File exceeds 25 MB.")
  if (!/\.(pdf|pptx?)$/i.test(file.name)) throw new Error("Use a PDF or PowerPoint file.")

  if (file.size <= INLINE_MAX) {
    const fd = new FormData(); fd.set("deck", file)
    const res = await fetch(endpoint, { method: "POST", body: fd })
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Upload failed (${res.status})`)
    return
  }
  const { upload } = await import("@vercel/blob/client")
  let url: string
  try {
    const blob = await upload(`${deckPrefix(publicRef)}deck-admin-${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`, file, {
      access: "private" as any, handleUploadUrl: endpoint, contentType: file.type || undefined,
    })
    url = blob.url
  } catch (e: any) { throw new Error(`Could not upload the deck: ${e?.message ?? "upload failed"}`) }
  const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ blobUrl: url }) })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Could not attach the deck (${res.status})`)
}

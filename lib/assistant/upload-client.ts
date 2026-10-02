"use client"
/** Browser side of chat attachments (docs/architecture/36). */
import { attachmentError, attachmentPrefix, needsBlob, type BlobRef } from "./attachment-limits"

export interface PreparedAttachments { inline: File[]; blobs: BlobRef[] }

/** Decide how the files travel. Small sets go inline; anything larger is uploaded straight
 *  to private Blob and only references go to the chat route. Throws a user-readable Error. */
export async function prepareAttachments(files: File[], scopeKey: string): Promise<PreparedAttachments> {
  const problem = attachmentError(files)
  if (problem) throw new Error(problem)
  if (!files.length || !needsBlob(files)) return { inline: files, blobs: [] }
  const { upload } = await import("@vercel/blob/client")
  const prefix = attachmentPrefix(scopeKey)
  const blobs: BlobRef[] = []
  for (const f of files) {
    try {
      const b = await upload(`${prefix}${crypto.randomUUID()}/${f.name.replace(/[^\w.\- ]/g, "_")}`, f, {
        access: "private" as any, handleUploadUrl: "/api/assistant/upload", contentType: f.type || undefined,
      })
      blobs.push({ url: b.url, name: f.name })
    } catch (e: any) {
      throw new Error(`Could not upload ${f.name}: ${e?.message ?? "upload failed"}`)
    }
  }
  return { inline: [], blobs }
}

/** A readable reason for a failed chat request, including the platform's own 413. */
export async function requestFailure(res: Response, fallback: string): Promise<string> {
  if (res.status === 413) return "That upload is too large for one message. Remove a file or attach smaller ones."
  const body = await res.json().catch(() => null)
  return body?.error ?? `${fallback} (${res.status})`
}

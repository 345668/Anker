import type { NextRequest } from "next/server"
import type { UploadedFile } from "./attachments"

/** A message from a JSON body, or from a form with files. */
export async function readMessage(req: NextRequest): Promise<{ body: unknown; files: UploadedFile[] }> {
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const f = await req.formData()
    const files: UploadedFile[] = []
    for (const v of f.getAll("file")) if (v instanceof File && v.size > 0) files.push({ filename: v.name, bytes: Buffer.from(await v.arrayBuffer()) })
    return { body: f.get("body"), files }
  }
  const b = await req.json()
  return { body: b?.body, files: [] }
}

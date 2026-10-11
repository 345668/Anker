import { createHash } from "node:crypto"
import { del, get, put } from "@vercel/blob"
import { WorkspaceError } from "@/lib/auth/workspace-context"

/** Where pipeline files live. Private Blob in production; an in-memory map in tests. */
export interface PipelineStorage {
  put(pathname: string, bytes: Buffer, contentType: string): Promise<void>
  get(pathname: string): Promise<Buffer>
  stream(pathname: string): Promise<ReadableStream | null>
  delete(pathname: string): Promise<void>
}

export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex")
const owner = (userId: string, scopeKey: string) =>
  createHash("sha256").update(`${userId}:${scopeKey}`).digest("hex").slice(0, 32)

/** `ai-studio-pipelines/<owner>/<pipeline>/<name>`. The owner segment is a hash of the user and workspace, as for assets. */
export const pipelinePath = (userId: string, scopeKey: string, pipelineId: string, name: string) =>
  `ai-studio-pipelines/${owner(userId, scopeKey)}/${pipelineId}/${name}`

const token = () => process.env.MEDIA_BLOB_READ_WRITE_TOKEN

export function blobStorage(): PipelineStorage {
  const open = async (pathname: string) => {
    const f = await get(pathname, {
      access: "private",
      token: token(),
      abortSignal: AbortSignal.timeout(60_000),
    })
    if (!f || f.statusCode !== 200) return null
    return f
  }
  return {
    async put(pathname, bytes, contentType) {
      await put(pathname, bytes, {
        access: "private",
        token: token(),
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        abortSignal: AbortSignal.timeout(120_000),
      })
    },
    async get(pathname) {
      const f = await open(pathname)
      if (!f) throw new WorkspaceError("A file for this step is missing.", 404)
      return Buffer.from(await new Response(f.stream).arrayBuffer())
    },
    async stream(pathname) {
      return (await open(pathname))?.stream ?? null
    },
    async delete(pathname) {
      await del(pathname, { token: token() }).catch(() => {})
    },
  }
}

export function memoryStorage(): PipelineStorage & {
  files: Map<string, { bytes: Buffer; contentType: string }>
} {
  const files = new Map<string, { bytes: Buffer; contentType: string }>()
  return {
    files,
    async put(pathname, bytes, contentType) {
      files.set(pathname, { bytes, contentType })
    },
    async get(pathname) {
      const f = files.get(pathname)
      if (!f) throw new WorkspaceError("A file for this step is missing.", 404)
      return f.bytes
    },
    async stream(pathname) {
      const f = files.get(pathname)
      return f ? new Response(new Uint8Array(f.bytes)).body : null
    },
    async delete(pathname) {
      files.delete(pathname)
    },
  }
}

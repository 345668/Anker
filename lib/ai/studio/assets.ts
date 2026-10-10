import { createHash } from "node:crypto"
import { get, put } from "@vercel/blob"
import { sql } from "@/lib/db"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import type { AiPrincipal } from "@/lib/assistant/context"
import type { AssetKind, Asset } from "./catalog"
export const MAX_BYTES = 64 * 1024 * 1024
export const hash = (s: string) => createHash("sha256").update(s).digest("hex")
export interface AssetRow {
  id: string
  user_id: string
  scope_key: string
  job_id: string | null
  kind: AssetKind
  pathname: string
  filename: string
  content_type: string
  bytes: number
  duration_ms?: number | null
}
export const publicAsset = (a: AssetRow): Asset => ({
  id: a.id,
  kind: a.kind,
  name: a.filename,
  url: `/api/anker/studio/assets/${a.id}`,
  durationMs: a.duration_ms ?? null,
})
export function mediaFormat(b: Buffer): { kind: AssetKind; type: string; ext: string } | null {
  if (b.length < 12) return null
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { kind: "image", type: "image/png", ext: "png" }
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return { kind: "image", type: "image/jpeg", ext: "jpg" }
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP")
    return { kind: "image", type: "image/webp", ext: "webp" }
  if (
    b.toString("ascii", 4, 8) === "ftyp" &&
    ["isom", "iso2", "mp41", "mp42", "avc1", "M4V ", "dash"].includes(b.toString("ascii", 8, 12))
  )
    return { kind: "video", type: "video/mp4", ext: "mp4" }
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WAVE")
    return { kind: "audio", type: "audio/wav", ext: "wav" }
  if (b.toString("ascii", 0, 3) === "ID3" || (b[0] === 255 && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0))
    return { kind: "audio", type: "audio/mpeg", ext: "mp3" }
  return null
}
export async function ownedAsset(p: Pick<AiPrincipal, "userId" | "scopeKey">, id: string): Promise<AssetRow> {
  const [a] =
    await sql`SELECT * FROM ai_studio_assets WHERE id=${id} AND user_id=${p.userId} AND scope_key=${p.scopeKey}`
  if (!a) throw new WorkspaceError("Asset unavailable in this workspace.", 404)
  return a as AssetRow
}
export async function storeAsset(
  p: Pick<AiPrincipal, "userId" | "scopeKey">,
  id: string,
  bytes: Buffer,
  kind: AssetKind,
  jobId: string | null,
  durationMs: number | null = null,
): Promise<AssetRow> {
  const f = mediaFormat(bytes)
  if (!f || f.kind !== kind || bytes.length > MAX_BYTES)
    throw new Error("Unsupported or oversized media output.")
  const filename = `anker-${kind}-${id}.${f.ext}`,
    pathname = `ai-studio/${hash(`${p.userId}:${p.scopeKey}`).slice(0, 32)}/${filename}`
  await put(pathname, bytes, {
    access: "private",
    token: process.env.MEDIA_BLOB_READ_WRITE_TOKEN,
    contentType: f.type,
    addRandomSuffix: false,
    allowOverwrite: true,
    abortSignal: AbortSignal.timeout(45000),
  })
  const [a] =
    await sql`INSERT INTO ai_studio_assets(id,user_id,scope_key,job_id,kind,pathname,filename,content_type,bytes,duration_ms) VALUES(${id},${p.userId},${p.scopeKey},${jobId},${kind},${pathname},${filename},${f.type},${bytes.length},${durationMs}) ON CONFLICT(id) DO UPDATE SET bytes=EXCLUDED.bytes RETURNING *`
  return a as AssetRow
}
export async function assetResponse(a: AssetRow, download = false) {
  const file = await get(a.pathname, {
    access: "private",
    token: process.env.MEDIA_BLOB_READ_WRITE_TOKEN,
    abortSignal: AbortSignal.timeout(45000),
  })
  if (!file || file.statusCode !== 200) throw new WorkspaceError("File unavailable. Please try again.", 404)
  return new Response(file.stream, {
    headers: {
      "Content-Type": a.content_type,
      "Content-Length": String(a.bytes),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${a.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  })
}
/** The stored bytes of an asset (a source image for a self-hosted recipe). */
export async function assetBytes(a: AssetRow): Promise<Buffer> {
  const file = await get(a.pathname, {
    access: "private",
    token: process.env.MEDIA_BLOB_READ_WRITE_TOKEN,
    abortSignal: AbortSignal.timeout(45000),
  })
  if (!file || file.statusCode !== 200) throw new WorkspaceError("File unavailable. Please try again.", 404)
  return Buffer.from(await new Response(file.stream).arrayBuffer())
}

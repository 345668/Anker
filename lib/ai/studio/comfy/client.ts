/** Anker's client for the ComfyUI gateway (docs/architecture/49). It speaks only the routes the gateway allows and never sends a user's graph. */
import { sql } from "@/lib/db"
import { ProviderError } from "../errors"
import type { GraphNode } from "./recipes"
export const FLAG = "ai_studio_comfy"
export interface ComfyConfig {
  base: string
  key: string
}
/** The gateway address and key, or null. `https` is required except on this machine or when COMFY_ALLOW_INSECURE=1 (a private dev network). */
export function comfyConfig(env: Record<string, string | undefined> = process.env): ComfyConfig | null {
  const key = env.COMFY_API_KEY?.trim()
  try {
    const u = new URL(env.COMFY_BASE_URL || "")
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
    if (
      !key ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      (u.protocol !== "https:" && !(u.protocol === "http:" && (local || env.COMFY_ALLOW_INSECURE === "1")))
    )
      return null
    return { base: u.toString().replace(/\/+$/, ""), key }
  } catch {
    return null
  }
}
let flagCache: { at: number; on: boolean } | null = null
/** The platform switch, read at most every 30 seconds. A failed read means off. */
export async function comfyEnabled(): Promise<boolean> {
  if (flagCache && Date.now() - flagCache.at < 30000) return flagCache.on
  let on = false
  try {
    const [f] = await sql`SELECT enabled FROM platform_flags WHERE key = ${FLAG}`
    on = !!f?.enabled
  } catch {}
  flagCache = { at: Date.now(), on }
  return on
}
export const _resetComfyFlagCache = () => {
  flagCache = null
}
const MAX_JSON = 2 * 1024 * 1024,
  MAX_FILE = 64 * 1024 * 1024
async function read(r: Response, limit: number): Promise<Buffer> {
  const chunks: Uint8Array[] = []
  let n = 0
  const reader = r.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    n += value.byteLength
    if (n > limit) {
      await reader.cancel()
      throw new ProviderError(502, "The worker's reply was too large.")
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}
async function call(
  c: ComfyConfig,
  path: string,
  init: {
    method?: string
    body?: BodyInit
    headers?: Record<string, string>
    timeout?: number
    limit?: number
  } = {},
) {
  const r = await fetch(`${c.base}${path}`, {
    method: init.method ?? "GET",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(init.timeout ?? 25000),
    headers: { "X-API-Key": c.key, ...init.headers },
    ...(init.body ? { body: init.body } : {}),
  })
  const bytes = await read(r, init.limit ?? MAX_JSON)
  if (!r.ok) {
    console.error(
      "[studio comfy]",
      path.replace(/[0-9a-f-]{36}/g, ":id"),
      r.status,
      bytes.toString("utf8").slice(0, 300),
    )
    throw new ProviderError(
      r.status,
      r.status === 401 || r.status === 403
        ? "The image worker rejected Anker's credentials. Contact your administrator."
        : r.status === 404
          ? "not_found"
          : r.status === 429
            ? "The image worker is busy. Try later."
            : r.status >= 500
              ? "The image worker is temporarily unavailable."
              : "The image worker refused these settings.",
    )
  }
  return bytes
}
const json = (b: Buffer) => {
  try {
    const v = JSON.parse(b.toString("utf8"))
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, any>
  } catch {}
  throw new ProviderError(502, "Invalid worker response.")
}
export interface OutputFile {
  filename: string
  subfolder: string
  type: string
}
export type ComfyState = "queued" | "running" | "completed" | "failed" | "canceled" | "missing"
export async function comfySubmit(c: ComfyConfig, graph: Record<string, GraphNode>, promptId: string) {
  const out = json(
    await call(c, "/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: graph, prompt_id: promptId, client_id: "anker-studio" }),
    }),
  )
  if (out.prompt_id !== promptId) throw new ProviderError(502, "The worker did not confirm the job.")
}
/** One job's state from the worker's jobs API; an id it has never seen is `missing`. */
export async function comfyJob(
  c: ComfyConfig,
  promptId: string,
  outputNode: string,
  key: string,
): Promise<{ state: ComfyState; files: OutputFile[]; error?: string }> {
  let j: Record<string, any>
  try {
    j = json(await call(c, `/api/jobs/${promptId}`))
  } catch (e) {
    if (e instanceof ProviderError && e.message === "not_found") return { state: "missing", files: [] }
    throw e
  }
  const s = String(j.status ?? "").toLowerCase()
  const state: ComfyState =
    s === "completed"
      ? "completed"
      : s === "failed" || s === "error"
        ? "failed"
        : s === "cancelled" || s === "canceled"
          ? "canceled"
          : s === "pending" || s === "queued"
            ? "queued"
            : "running"
  const arr = j.outputs?.[outputNode]?.[key]
  const files: OutputFile[] = Array.isArray(arr)
    ? arr
        .filter((f: any) => f && typeof f.filename === "string")
        .map((f: any) => ({
          filename: f.filename,
          subfolder: String(f.subfolder ?? ""),
          type: String(f.type ?? "output"),
        }))
    : []
  return {
    state,
    files,
    error: state === "failed" ? String(j.execution_status?.status_str ?? "failed").slice(0, 120) : undefined,
  }
}
export async function comfyView(c: ComfyConfig, f: OutputFile): Promise<Buffer> {
  const q = new URLSearchParams({ filename: f.filename, subfolder: f.subfolder, type: f.type })
  return call(c, `/view?${q}`, { timeout: 60000, limit: MAX_FILE })
}
export async function comfyUpload(c: ComfyConfig, bytes: Buffer, name: string, type: string) {
  const f = new FormData()
  f.set("image", new Blob([new Uint8Array(bytes)], { type }), name)
  f.set("overwrite", "true")
  const out = json(await call(c, "/upload/image", { method: "POST", body: f, timeout: 45000 }))
  if (out.name !== name) throw new ProviderError(502, "The worker renamed the upload.")
}
export const comfyStats = async (c: ComfyConfig) => json(await call(c, "/system_stats"))

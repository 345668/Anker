import { WorkspaceError } from "@/lib/auth/workspace-context"
import { mapInput, type GenerationInput } from "./catalog"
export function configuration() {
  const key = process.env.HF_API_KEY?.trim()
  let base = ""
  try {
    const u = new URL(process.env.HF_API_BASE_URL || "")
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) throw new Error()
    base = u.toString().replace(/\/$/, "")
  } catch {}
  return {
    ready: !!(base && key && /^[^\s:]+:[^\s]+$/.test(key) && process.env.MEDIA_BLOB_READ_WRITE_TOKEN),
    base,
    key,
  }
}
export function requireConfiguration() {
  const c = configuration()
  if (!c.ready)
    throw new WorkspaceError(
      "Media Studio needs administrator setup. Chat and saved media remain available.",
      503,
    )
  return c
}
export class ProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}
async function request(path: string, body?: object): Promise<Record<string, unknown>> {
  const c = requireConfiguration()
  const r = await fetch(`${c.base}/${path}`, {
    method: body ? "POST" : "GET",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
    headers: { Authorization: `Key ${c.key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!r.ok)
    throw new ProviderError(
      r.status,
      r.status === 401 || r.status === 403
        ? "Generation credentials were rejected. Contact your administrator."
        : r.status === 429
          ? "Provider capacity or allowance is exhausted. Try later."
          : r.status >= 500
            ? "The generation provider is temporarily unavailable."
            : "The provider rejected these settings. Review the prompt and model.",
    )
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = r.body?.getReader()
  if (reader)
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 200000) {
        await reader.cancel()
        throw new ProviderError(502, "Invalid provider response.")
      }
      chunks.push(value)
    }
  let data: unknown
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new ProviderError(502, "Invalid provider response.")
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new ProviderError(502, "Invalid provider response.")
  return data as Record<string, unknown>
}
export async function submitGeneration(v: GenerationInput, sourceUrl?: string) {
  const mapped = mapInput(v, sourceUrl),
    r = await request(mapped.path, mapped.body)
  if (typeof r.request_id !== "string" || !r.request_id || r.request_id.length > 500)
    throw new ProviderError(502, "Submission returned no request ID and may have succeeded.")
  return r.request_id
}
export async function generationStatus(id: string) {
  const r = await request(`requests/${encodeURIComponent(id)}/status`)
  const images = Array.isArray(r.images)
    ? r.images.flatMap((x: unknown) => {
        const u = (x as { url?: unknown })?.url
        return typeof u === "string" ? [u] : []
      })
    : []
  const video = (r.video as { url?: unknown })?.url
  return {
    status: String(r.status || "unknown").toLowerCase(),
    image: images[0] || null,
    video: typeof video === "string" ? video : null,
  }
}

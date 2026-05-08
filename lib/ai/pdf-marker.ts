/**
 * Marker PDF → Markdown sidecar client.
 *
 * The Marker container (scripts/marker/Dockerfile, exposed on
 * MARKER_URL — default http://127.0.0.1:8001) does the heavy lifting
 * with small CV models.  Quality on image-heavy decks is dramatically
 * better than `pdf-parse`, which only sees text layers.
 *
 * Use:
 *
 *   const md = await markerExtractMarkdown(buffer, "deck.pdf")
 *   if (md && md.markdown.length > 0) {
 *     // use it
 *   } else {
 *     // fall back to extractPdfText() in lib/ai/pdf.ts
 *   }
 *
 * The wrapper times out fast and returns null when the sidecar isn't
 * reachable, so callers can degrade gracefully.
 */

const MARKER_URL = (process.env.MARKER_URL ?? "http://127.0.0.1:8001").replace(/\/+$/, "")

export interface MarkerResult {
  ok: boolean
  markdown: string
  pages: number
  durationMs: number
  filename?: string
}

export async function isMarkerAvailable(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch(`${MARKER_URL}/healthz`, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return false
    const json = (await res.json()) as { ok?: boolean }
    return json?.ok === true
  } catch { return false }
}

/** Send a PDF to the Marker sidecar.  Returns null on any failure. */
export async function markerExtractMarkdown(
  pdfBuffer: Buffer,
  filename: string,
  opts: { timeoutMs?: number } = {},
): Promise<MarkerResult | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 240_000)
  try {
    // multipart/form-data
    const fd = new FormData()
    const blob = new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" })
    fd.append("file", blob, filename || "deck.pdf")
    const res = await fetch(`${MARKER_URL}/convert`, {
      method: "POST",
      body: fd,
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      console.warn(`[marker] non-200 ${res.status}: ${text.slice(0, 200)}`)
      return null
    }
    const json = (await res.json()) as MarkerResult
    return json
  } catch (e: any) {
    console.warn("[marker] error:", e?.message ?? e)
    return null
  } finally {
    clearTimeout(timer)
  }
}

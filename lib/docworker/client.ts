/**
 * Doc/compute-worker client (§C of the tooling expansion — the "fork").
 *
 * LaTeX (tectonic), LibreOffice, and python-docx are local binaries that cannot run
 * inside a Vercel serverless function. To get white-paper-class typeset PDFs the agent
 * calls out to a small long-running worker that HAS those binaries. This module is the
 * thin HTTP client for that worker; the worker itself is a separate deployable (a
 * container running the reference server in `docs/anker-agent-tooling-expansion.md`).
 *
 * The seam is intentionally inert until configured: with no DOC_WORKER_URL the client
 * reports "not configured" and callers fall back to the serverless docx/pdf path. This
 * keeps the platform serverless-native by default and lets the high-fidelity path light
 * up the moment a worker is deployed — no code change.
 *
 * Worker contract (POST {DOC_WORKER_URL}/render):
 *   request  JSON  { engine: "latex"|"libreoffice", source: string, filename?: string,
 *                    format?: "pdf"|"docx" }
 *                  · engine "latex": `source` is a LaTeX document; compiled with tectonic → pdf
 *                  · engine "libreoffice": `source` is base64 of an input doc; converted → format
 *   response       the rendered bytes, Content-Type application/pdf or the docx mime.
 *                  non-2xx → { error } JSON.
 *   auth           optional bearer via DOC_WORKER_TOKEN.
 */

export type DocEngine = "latex" | "libreoffice";

export function isDocWorkerConfigured(): boolean {
  return !!process.env.DOC_WORKER_URL;
}

export interface RenderRequest {
  engine: DocEngine;
  /** LaTeX source (engine "latex") or base64 of an input document (engine "libreoffice"). */
  source: string;
  filename?: string;
  format?: "pdf" | "docx";
}

export interface RenderResult {
  ok: boolean;
  bytes?: Buffer;
  contentType?: string;
  error?: string;
}

const TIMEOUT_MS = Math.min(120_000, Math.max(5_000, Number(process.env.DOC_WORKER_TIMEOUT_MS) || 60_000));

/** Render via the worker. Never throws — returns `{ ok:false, error }` so tools can
 *  degrade gracefully to the serverless path. */
export async function renderViaDocWorker(req: RenderRequest): Promise<RenderResult> {
  const base = process.env.DOC_WORKER_URL;
  if (!base) {
    return { ok: false, error: "DOC_WORKER_URL is not configured — high-fidelity LaTeX/LibreOffice rendering needs a doc-worker deployed. Use the serverless docx/pdf tools instead, or set DOC_WORKER_URL." };
  }
  const url = `${base.replace(/\/$/, "")}/render`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.DOC_WORKER_TOKEN) headers["Authorization"] = `Bearer ${process.env.DOC_WORKER_TOKEN}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(req), signal: controller.signal });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `Doc-worker ${res.status}: ${txt.slice(0, 300)}` };
    }
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length) return { ok: false, error: "Doc-worker returned an empty document." };
    return { ok: true, bytes, contentType };
  } catch (e: any) {
    const reason = e?.name === "AbortError" ? `timed out after ${TIMEOUT_MS}ms` : (e?.message ?? "network error");
    return { ok: false, error: `Doc-worker request failed: ${reason}` };
  } finally {
    clearTimeout(timer);
  }
}

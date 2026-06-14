/**
 * Anker AI Assistant — artifact + tool-result types and the serverless-aware
 * file writer used by every tool that returns a downloadable file.
 *
 * Extracted from lib/assistant/tools.ts to break a circular dependency between
 * tools.ts (registry) and tools-fo.ts (FO tools that need saveArtifact).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface ToolArtifact { name: string; url: string; kind: "xlsx" | "docx" | "csv" | "png" | "pptx" | "pdf" }
export interface ToolResult { observation: string; artifact?: ToolArtifact }
export interface ToolDef {
  name: string;
  description: string;
  /** Human-readable parameter hints shown to the model. */
  params: string;
  run: (input: any) => Promise<ToolResult>;
}

// ── artifact output dir ──────────────────────────────────────────────────────
//
// On local dev / standalone Node, we write into public/generated/ so files
// are served by Next.js's static handler.  On Vercel serverless, public/ is
// read-only (bundled at build time) — only /tmp/ is writable inside the
// Lambda.  We detect the deploy by checking VERCEL/AWS_LAMBDA_FUNCTION_NAME
// or by catching EROFS on the first write, then write to /tmp/anker-
// artifacts/ and surface the file via a dynamic /api/artifacts/<file> route
// that streams it back from /tmp.  Files in /tmp survive only within the
// warm function instance — that's fine for an interactive assistant.
const STATIC_OUT_DIR = path.join(process.cwd(), "public", "generated");
const TMP_OUT_DIR = path.join("/tmp", "anker-artifacts");
const isServerless = !!(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NEXT_RUNTIME === "edge"
);
const CONTENT_TYPE: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf:  "application/pdf",
  csv:  "text/csv; charset=utf-8",
  png:  "image/png",
};

const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
const isVercel  = !!process.env.VERCEL;

export async function saveArtifact(buf: Buffer, base: string, kind: ToolArtifact["kind"]): Promise<ToolArtifact> {
  const safe = base.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "output";
  const file = `${safe}_${randomUUID().slice(0, 8)}.${kind}`;

  // ── Path 1: Vercel Blob (durable, cross-instance, the correct path on Vercel)
  // Triggered when BLOB_READ_WRITE_TOKEN is set (Vercel injects this once Blob
  // is enabled on the project; falls back gracefully when absent).
  //
  // The store is configured with PRIVATE access, so we upload with
  // access:"private" (uploading "public" to a private store throws) and return
  // a stable /api/artifacts/<file> URL.  That route streams the blob back to
  // authenticated users — the raw private blob URL is not directly openable.
  if (blobToken || isVercel) {
    try {
      const { put } = await import("@vercel/blob");
      await put(`anker-artifacts/${file}`, buf, {
        access: "private",
        contentType: CONTENT_TYPE[kind] ?? "application/octet-stream",
        addRandomSuffix: false,
        token: blobToken,
      });
      return { name: file, url: `/api/artifacts/${file}`, kind };
    } catch (e: any) {
      // If Blob isn't configured yet (no token), surface a clear error rather
      // than silently writing to /tmp where the file will vanish.
      if (isVercel && !blobToken) {
        throw new Error(
          "Vercel deployment detected but BLOB_READ_WRITE_TOKEN is not set. " +
          "Enable Vercel Blob storage for this project (Vercel dashboard -> Storage -> Create Blob Store) " +
          "and redeploy. Without it, artifact downloads return 404 because /tmp is per-Lambda."
        );
      }
      // Local dev with the token set but Blob unreachable -> fall through to disk.
      console.warn("[saveArtifact] Vercel Blob upload failed, falling back to disk:", e?.message);
    }
  }

  // ── Path 2: local disk (dev only)
  const tryDirs = isServerless
    ? [TMP_OUT_DIR, STATIC_OUT_DIR]
    : [STATIC_OUT_DIR, TMP_OUT_DIR];

  let lastErr: any = null;
  for (const dir of tryDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, file), buf);
      const url = dir === STATIC_OUT_DIR ? `/generated/${file}` : `/api/artifacts/${file}`;
      return { name: file, url, kind };
    } catch (e: any) {
      lastErr = e;
      if (!["EROFS", "EACCES", "ENOENT", "EPERM"].includes(e?.code)) throw e;
    }
  }
  throw new Error(`saveArtifact: no writable directory (${lastErr?.code ?? "unknown"})`);
}

function clip(s: string, n = 1500): string {
  s = (s ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + " …[truncated]" : s;
}

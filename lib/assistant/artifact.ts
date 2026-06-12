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
export async function saveArtifact(buf: Buffer, base: string, kind: ToolArtifact["kind"]): Promise<ToolArtifact> {
  const safe = base.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "output";
  const file = `${safe}_${randomUUID().slice(0, 8)}.${kind}`;

  // Prefer the static dir locally; fall back to /tmp on serverless or on EROFS.
  const tryDirs = isServerless
    ? [TMP_OUT_DIR, STATIC_OUT_DIR]
    : [STATIC_OUT_DIR, TMP_OUT_DIR];

  let lastErr: any = null;
  for (const dir of tryDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, file), buf);
      // Files written to the static dir are served directly; everything else
      // routes through the dynamic /api/artifacts/<file> streamer.
      const url = dir === STATIC_OUT_DIR ? `/generated/${file}` : `/api/artifacts/${file}`;
      return { name: file, url, kind };
    } catch (e: any) {
      lastErr = e;
      // EROFS / EACCES / ENOENT — fall through to the next candidate dir.
      if (!["EROFS", "EACCES", "ENOENT", "EPERM"].includes(e?.code)) throw e;
    }
  }
  throw new Error(`saveArtifact: no writable directory (${lastErr?.code ?? "unknown"})`);
}

function clip(s: string, n = 1500): string {
  s = (s ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + " …[truncated]" : s;
}

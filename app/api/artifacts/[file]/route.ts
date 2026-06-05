/**
 * GET /api/artifacts/[file]
 *
 * Streams an AI-assistant-generated artifact back to the client.  Files
 * may live in /tmp/anker-artifacts (Vercel serverless — public/ is
 * read-only) or in public/generated (local dev fallback).  Path is
 * sanitised: only basenames with the kinds we actually produce.
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EXT = new Set([".xlsx", ".docx", ".csv", ".png", ".pptx", ".pdf", ".jpg", ".jpeg", ".gif", ".webp"]);

const CONTENT_TYPE: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".pdf":  "application/pdf",
  ".csv":  "text/csv; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
};

const CANDIDATE_DIRS = [
  path.join("/tmp", "anker-artifacts"),
  path.join(process.cwd(), "public", "generated"),
];

export async function GET(_req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  // Hard sanitisation: only the basename, no traversal.
  const safe = path.basename(file ?? "");
  const ext = path.extname(safe).toLowerCase();
  if (!safe || safe !== file || !ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  for (const dir of CANDIDATE_DIRS) {
    const full = path.join(dir, safe);
    try {
      const data = await fs.readFile(full);
      return new NextResponse(new Uint8Array(data), {
        status: 200,
        headers: {
          "Content-Type": CONTENT_TYPE[ext] ?? "application/octet-stream",
          "Content-Disposition": `attachment; filename="${safe}"`,
          "Cache-Control": "private, max-age=300",
        },
      });
    } catch {
      // try next dir
    }
  }
  return NextResponse.json({ error: "Artifact not found (Vercel /tmp is per-instance; may have rotated)" }, { status: 404 });
}

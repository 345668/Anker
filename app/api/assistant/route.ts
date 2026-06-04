/**
 * Anker AI Assistant API.
 *
 * Two modes:
 *
 * 1. application/json   { task: string, maxSteps?: number }
 *    Original text-only path.
 *
 * 2. multipart/form-data
 *      task            string (required)
 *      maxSteps        number (optional)
 *      files           one or more File objects: PDFs, images, text, audio
 *    Each file is pre-processed BEFORE the agent loop runs:
 *      - PDFs       → extractPdfText() → injected as "[Document: name] …"
 *      - Images     → kept as base64 → exposed to the agent as a
 *                     {{IMAGE: <id>}} marker the agent can pass to
 *                     analyze_image / ocr_image (resolved server-side)
 *      - Text/MD    → inlined verbatim
 *    The augmented context goes into the agent prompt so the assistant
 *    can reference uploads in its reasoning + tool calls.
 *
 * Auth: any signed-in user.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAssistant } from "@/lib/assistant/agent";
import { extractPdfText } from "@/lib/ai/pdf";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILE_BYTES = 25 * 1024 * 1024;       // 25 MB per file
const MAX_TOTAL_BYTES = 75 * 1024 * 1024;      // 75 MB across all files

interface PreprocessedFile {
  name: string;
  kind: "pdf" | "image" | "text" | "audio" | "other";
  contentType: string;
  sizeBytes: number;
  /** Extracted text content if applicable. */
  text?: string;
  /** Base64 (for images forwarded to vision tools). */
  base64?: string;
  notes?: string;
}

async function preprocess(file: File): Promise<PreprocessedFile> {
  const buf = Buffer.from(await file.arrayBuffer());
  const out: PreprocessedFile = {
    name: file.name,
    kind: "other",
    contentType: file.type || "application/octet-stream",
    sizeBytes: buf.length,
  };
  if (buf.length > MAX_FILE_BYTES) {
    out.notes = `File exceeds ${MAX_FILE_BYTES / 1e6}MB cap — skipped`;
    return out;
  }
  // PDF
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    out.kind = "pdf";
    try {
      const parsed = await extractPdfText(buf);
      out.text = parsed.text;
      out.notes = `${parsed.pageCount} page(s); ${parsed.imageOnlyPages} image-only`;
    } catch (e: any) {
      out.notes = `PDF text extraction failed: ${e?.message ?? "error"}`;
    }
    return out;
  }
  // Image
  if (file.type.startsWith("image/")) {
    out.kind = "image";
    out.base64 = buf.toString("base64");
    out.notes = `${file.type}, ${Math.round(buf.length / 1024)} KB`;
    return out;
  }
  // Audio (placeholder — Qwen ASR wiring lands when used)
  if (file.type.startsWith("audio/")) {
    out.kind = "audio";
    out.notes = "Audio uploads accepted but not yet transcribed in this build — use a separate transcription tool.";
    return out;
  }
  // Plain text / markdown / csv (inline first 50 KB)
  if (/^text\//.test(file.type) || /\.(md|markdown|txt|csv|json)$/i.test(file.name)) {
    out.kind = "text";
    out.text = buf.toString("utf8").slice(0, 50000);
    out.notes = `${out.text.length} chars inlined`;
    return out;
  }
  out.notes = `Unsupported type (${file.type}) — file kept but not preprocessed`;
  return out;
}

function buildAugmentedTask(task: string, files: PreprocessedFile[]): { augmentedTask: string; imageRefs: Array<{ id: string; name: string; base64: string }> } {
  if (!files.length) return { augmentedTask: task, imageRefs: [] };
  const imageRefs: Array<{ id: string; name: string; base64: string }> = [];
  const lines: string[] = [];
  files.forEach((f, idx) => {
    if (f.kind === "pdf" && f.text) {
      lines.push(`\n--- Uploaded document: ${f.name} (${f.notes ?? ""}) ---`);
      lines.push(f.text.slice(0, 20000));
    } else if (f.kind === "text" && f.text) {
      lines.push(`\n--- Uploaded ${f.contentType || "text"}: ${f.name} ---`);
      lines.push(f.text);
    } else if (f.kind === "image" && f.base64) {
      const id = `IMG${idx + 1}`;
      imageRefs.push({ id, name: f.name, base64: f.base64 });
      lines.push(`\n--- Uploaded image: ${f.name} → reference id "${id}" (${f.notes ?? ""}) ---`);
      lines.push(`If the user's task requires reading this image, call the analyze_image or ocr_image tool with { "imageBase64": "<<${id}>>" } — the server will substitute the base64 at execution time.`);
    } else {
      lines.push(`\n--- ${f.name} (${f.kind}): ${f.notes ?? "no preview"} ---`);
    }
  });
  const augmented = task + "\n\nUPLOADED FILES (use as context; reference images by id):" + lines.join("\n");
  return { augmentedTask: augmented, imageRefs };
}

export async function POST(req: NextRequest) {
  // Auth check
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) {
      userId = data.user.id;
    }
  } catch (authErr: any) {
    console.error("[assistant] auth exception:", authErr?.message);
  }

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ct = req.headers.get("content-type") || "";
  let task = "";
  let maxSteps = 6;
  let files: PreprocessedFile[] = [];

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    task = String(form.get("task") ?? "").trim();
    const ms = form.get("maxSteps");
    if (ms) maxSteps = Number(ms) || 6;
    const fileEntries = form.getAll("files").filter((v): v is File => v instanceof File);
    let total = 0;
    for (const f of fileEntries) {
      total += f.size;
      if (total > MAX_TOTAL_BYTES) break;
      const pre = await preprocess(f);
      files.push(pre);
    }
  } else {
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
    task = String(body?.task ?? "").trim();
    maxSteps = Number(body?.maxSteps) || 6;
  }

  if (!task) return NextResponse.json({ error: "Provide a 'task'." }, { status: 400 });

  const { augmentedTask, imageRefs } = buildAugmentedTask(task, files);

  try {
    const result = await runAssistant(augmentedTask, { maxSteps, imageRefs });
    return NextResponse.json({ ...result, filesProcessed: files.map((f) => ({ name: f.name, kind: f.kind, sizeBytes: f.sizeBytes, notes: f.notes })) });
  } catch (e: any) {
    console.error("[assistant] run failed:", e?.message);
    return NextResponse.json({ error: e?.message ?? "Assistant run failed" }, { status: 500 });
  }
}

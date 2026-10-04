/**
 * Anker doc/compute worker — the high-fidelity rendering sidecar (§C of the tooling
 * expansion). It runs the local binaries that cannot run on Vercel serverless:
 *   • tectonic     — compile LaTeX → PDF (white-paper-class typesetting)
 *   • libreoffice  — convert Word/Excel/PowerPoint/ODF/RTF → PDF, and PDF → Word
 *
 * The Anker app talks to this over the contract in lib/docworker/client.ts:
 *   POST /render   { engine: "latex"|"libreoffice", source, filename?, format?, options?: { singlePageSheets?: boolean } }
 *                  → the rendered bytes (application/pdf or the docx mime)
 *   GET  /health   → { ok: true, soffice: boolean } for load-balancer probes
 *
 * Dependency-free (Node builtins only) so the container stays small. Auth is a bearer
 * token (DOC_WORKER_TOKEN); the worker REFUSES to start without one unless
 * DOC_WORKER_ALLOW_NO_AUTH=1 (local development), because it converts untrusted files.
 *
 * Handling untrusted documents: each conversion gets its own temp dir and its own
 * LibreOffice profile with macros disabled and link updating off; runs as a non-root
 * user; is killed on a timeout; and at most DOC_WORKER_CONCURRENCY conversions run at once
 * (the rest queue briefly, then get a 429). Put the container on a network with no route to
 * your internal services: a document can ask LibreOffice to fetch a URL.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Input formats LibreOffice converts to PDF. `pdf` is only valid as the source of a Word conversion. */
const INPUT_EXT = new Set(["doc", "docx", "odt", "rtf", "txt", "xls", "xlsx", "ods", "csv", "ppt", "pptx", "odp", "html", "pdf"]);

export function sanitizeName(name) {
  const base = path.basename(String(name || "")).replace(/[^\w.\- ]/g, "_");
  return base.slice(0, 120);
}

/** The extension to give the input file: from the filename when it is a known type, else sniffed from the bytes. */
export function inputExtension(filename, bytes) {
  const ext = path.extname(sanitizeName(filename)).slice(1).toLowerCase();
  if (INPUT_EXT.has(ext)) return ext;
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  return "docx"; // a zip with no usable name: the most common Office input
}

/** Pure: what to run for a given input and target. Returns { error } for a combination that is not supported. */
const SHEET_EXT = new Set(["xls", "xlsx", "ods", "csv"]);

export function planConversion(ext, format, options = {}) {
  const target = format === "docx" ? "docx" : "pdf";
  if (ext === "pdf") {
    if (target !== "docx") return { error: "A PDF can only be converted to Word (docx)." };
    // Open the PDF in Writer (text frames positioned as on the page), then save as Word.
    return { target, infilter: "writer_pdf_import", convertTo: "docx:MS Word 2007 XML" };
  }
  if (target === "docx") return { error: "Only a PDF can be converted to Word with this worker." };
  // A spreadsheet printed normally splits a wide sheet across pages; "one page per sheet" keeps each sheet whole (pages can be large).
  if (SHEET_EXT.has(ext) && options.singlePageSheets === true) return { target, infilter: null, convertTo: 'pdf:calc_pdf_Export:{"SinglePageSheets":{"type":"boolean","value":"true"}}' };
  return { target, infilter: null, convertTo: "pdf" };
}

/** A profile that never runs macros and never fetches linked content. */
const PROFILE_XCU = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item>
</oor:items>`;

export function createWorker(opts = {}) {
  const TOKEN = opts.token ?? process.env.DOC_WORKER_TOKEN ?? "";
  const MAX_BODY = Number(opts.maxBody ?? process.env.DOC_WORKER_MAX_BODY_BYTES) || 48 * 1024 * 1024;
  const RENDER_TIMEOUT_MS = Number(opts.timeoutMs ?? process.env.DOC_WORKER_RENDER_TIMEOUT_MS) || 90_000;
  const CONCURRENCY = Math.max(1, Number(opts.concurrency ?? process.env.DOC_WORKER_CONCURRENCY) || 2);
  const MAX_QUEUE = Number(opts.maxQueue ?? process.env.DOC_WORKER_MAX_QUEUE) || 8;
  const SOFFICE = opts.soffice ?? process.env.DOC_WORKER_SOFFICE ?? "soffice";

  let running = 0;
  const waiting = [];
  const acquire = () => new Promise((resolve, reject) => {
    if (running < CONCURRENCY) { running++; return resolve(); }
    if (waiting.length >= MAX_QUEUE) return reject(Object.assign(new Error("busy"), { code: "BUSY" }));
    waiting.push(resolve);
  });
  const release = () => { const next = waiting.shift(); if (next) next(); else running--; };

  function run(cmd, args, cwd) {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      const timer = setTimeout(() => { child.kill("SIGKILL"); resolve({ ok: false, timeout: true, error: `${path.basename(cmd)} timed out after ${RENDER_TIMEOUT_MS} ms` }); }, RENDER_TIMEOUT_MS);
      child.stderr.on("data", (d) => { stderr = (stderr + d.toString()).slice(-4000); });
      child.on("error", (e) => { clearTimeout(timer); resolve({ ok: false, error: `${path.basename(cmd)} failed to start: ${e.message} (is it installed in the image?)` }); });
      child.on("close", (code) => { clearTimeout(timer); resolve(code === 0 ? { ok: true } : { ok: false, error: `${path.basename(cmd)} exited ${code}: ${stderr.slice(-600)}` }); });
    });
  }

  async function renderLatex(source) {
    const dir = await mkdtemp(path.join(tmpdir(), "docw-tex-"));
    try {
      const tex = path.join(dir, "doc.tex");
      await writeFile(tex, source, "utf8");
      const r = await run("tectonic", ["--outdir", dir, "--chatter", "minimal", tex], dir);
      if (!r.ok) return { error: r.error };
      const pdf = await readFile(path.join(dir, "doc.pdf")).catch(() => null);
      if (!pdf) return { error: "tectonic produced no PDF (check the LaTeX source for a fatal error)." };
      return { bytes: pdf, contentType: "application/pdf" };
    } finally { await rm(dir, { recursive: true, force: true }); }
  }

  async function renderLibreOffice(sourceB64, format, filename, options) {
    const bytes = Buffer.from(sourceB64, "base64");
    if (!bytes.length) return { error: "The document is empty." };
    const ext = inputExtension(filename, bytes);
    const plan = planConversion(ext, format, options);
    if (plan.error) return { error: plan.error, status: 400 };
    const dir = await mkdtemp(path.join(tmpdir(), "docw-lo-"));
    try {
      const input = path.join(dir, `input.${ext}`);
      await writeFile(input, bytes);
      const profile = path.join(dir, "profile");
      await mkdir(path.join(profile, "user"), { recursive: true });
      await writeFile(path.join(profile, "user", "registrymodifications.xcu"), PROFILE_XCU);
      const args = ["--headless", "--norestore", "--nolockcheck", `-env:UserInstallation=${pathToFileURL(profile).href}`];
      if (plan.infilter) args.push(`--infilter=${plan.infilter}`);
      args.push("--convert-to", plan.convertTo, "--outdir", dir, input);
      const r = await run(SOFFICE, args, dir);
      if (!r.ok) return { error: r.error, status: r.timeout ? 504 : 422 };
      const out = await readFile(path.join(dir, `input.${plan.target}`)).catch(() => null);
      if (!out || !out.length) return { error: `LibreOffice produced no .${plan.target} (unsupported or damaged input?).`, status: 422 };
      return { bytes: out, contentType: plan.target === "docx" ? DOCX_MIME : "application/pdf" };
    } finally { await rm(dir, { recursive: true, force: true }); }
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0, over = false; const chunks = [];
      // Past the cap, keep reading but discard, so the client receives a clean 413 instead of a reset connection.
      req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { over = true; chunks.length = 0; } else if (!over) chunks.push(c); });
      req.on("end", () => (over ? reject(Object.assign(new Error("payload too large"), { code: "TOO_LARGE" })) : resolve(Buffer.concat(chunks))));
      req.on("error", reject);
    });
  }

  const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  const authorised = (req) => {
    if (!TOKEN) return true;
    const given = Buffer.from(req.headers["authorization"] || "");
    const want = Buffer.from(`Bearer ${TOKEN}`);
    return given.length === want.length && timingSafeEqual(given, want);
  };

  let sofficeOk = null;
  const probeSoffice = () => (sofficeOk ??= run(SOFFICE, ["--version"], tmpdir()).then((r) => r.ok));

  const server = http.createServer(async (req, res) => {
    const route = (req.url ?? "").split("?")[0];
    if (req.method === "GET" && route === "/health") return json(res, 200, { ok: true, soffice: await probeSoffice(), concurrency: CONCURRENCY, running, queued: waiting.length });
    if (req.method !== "POST" || route !== "/render") return json(res, 404, { error: "not found" });
    if (!authorised(req)) return json(res, 401, { error: "unauthorized" });
    let body;
    try { body = JSON.parse((await readBody(req)).toString("utf8") || "{}"); }
    catch (e) { return json(res, e.code === "TOO_LARGE" ? 413 : 400, { error: e.code === "TOO_LARGE" ? "payload too large" : `bad request: ${e.message}` }); }

    const engine = body.engine === "libreoffice" ? "libreoffice" : "latex";
    const source = typeof body.source === "string" ? body.source : "";
    if (!source.trim()) return json(res, 400, { error: "missing 'source'" });

    try { await acquire(); } catch { return json(res, 429, { error: "The converter is busy. Please try again in a moment." }); }
    const t0 = Date.now();
    try {
      const result = engine === "libreoffice"
        ? await renderLibreOffice(source, body.format === "docx" ? "docx" : "pdf", body.filename, body.options && typeof body.options === "object" ? body.options : {})
        : await renderLatex(source);
      if (result.error || !result.bytes) return json(res, result.status ?? 422, { error: result.error ?? "render failed" });
      res.writeHead(200, { "Content-Type": result.contentType, "Content-Length": result.bytes.length, "X-Doc-Worker-Ms": String(Date.now() - t0) });
      res.end(result.bytes);
    } catch (e) {
      json(res, 500, { error: `internal: ${e.message}` });
    } finally { release(); }
  });
  return server;
}

// Start only when run directly, so the tests can import createWorker.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const PORT = Number(process.env.PORT) || 8080;
  if (!process.env.DOC_WORKER_TOKEN && process.env.DOC_WORKER_ALLOW_NO_AUTH !== "1") {
    console.error("[doc-worker] refusing to start: DOC_WORKER_TOKEN is not set. Set it, or DOC_WORKER_ALLOW_NO_AUTH=1 for local development only.");
    process.exit(1);
  }
  createWorker().listen(PORT, () => console.log(`[doc-worker] listening on :${PORT} (auth ${process.env.DOC_WORKER_TOKEN ? "on" : "OFF"})`));
}

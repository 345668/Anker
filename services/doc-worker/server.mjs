/**
 * Anker doc/compute worker — the high-fidelity rendering sidecar (§C of the tooling
 * expansion). It runs the local binaries that cannot run on Vercel serverless:
 *   • tectonic     — compile LaTeX → PDF (white-paper-class typesetting)
 *   • libreoffice  — convert docx/odt/… → PDF or docx
 *
 * The Anker app talks to this over the contract in lib/docworker/client.ts:
 *   POST /render   { engine: "latex"|"libreoffice", source, filename?, format? }
 *                  → the rendered bytes (application/pdf or the docx mime)
 *   GET  /health   → { ok: true } for load-balancer probes
 *
 * Dependency-free (Node builtins only) so the container stays small. Auth is an
 * optional bearer token (DOC_WORKER_TOKEN); set it in prod and mirror it in the app.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.PORT) || 8080;
const TOKEN = process.env.DOC_WORKER_TOKEN || "";
const MAX_BODY = Number(process.env.DOC_WORKER_MAX_BODY_BYTES) || 8 * 1024 * 1024; // 8MB
const RENDER_TIMEOUT_MS = Number(process.env.DOC_WORKER_RENDER_TIMEOUT_MS) || 90_000;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Run a binary, capturing stdout is not needed (we read the output file); we only
 *  need exit status + stderr for diagnostics. Killed after RENDER_TIMEOUT_MS. */
function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd });
    let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve({ ok: false, error: `${cmd} timed out` }); }, RENDER_TIMEOUT_MS);
    child.stderr.on("data", (d) => { stderr += d.toString().slice(0, 4000); });
    child.on("error", (e) => { clearTimeout(timer); resolve({ ok: false, error: `${cmd} failed to start: ${e.message} (is it installed in the image?)` }); });
    child.on("close", (code) => { clearTimeout(timer); resolve(code === 0 ? { ok: true } : { ok: false, error: `${cmd} exited ${code}: ${stderr.slice(-600)}` }); });
  });
}

async function renderLatex(source) {
  const dir = await mkdtemp(path.join(tmpdir(), "docw-tex-"));
  try {
    const tex = path.join(dir, "doc.tex");
    await writeFile(tex, source, "utf8");
    // tectonic is self-contained (fetches packages on demand, caches them).
    const r = await run("tectonic", ["--outdir", dir, "--chatter", "minimal", tex], dir);
    if (!r.ok) return { error: r.error };
    const pdf = await readFile(path.join(dir, "doc.pdf")).catch(() => null);
    if (!pdf) return { error: "tectonic produced no PDF (check the LaTeX source for a fatal error)." };
    return { bytes: pdf, contentType: "application/pdf" };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

async function renderLibreOffice(sourceB64, format) {
  const dir = await mkdtemp(path.join(tmpdir(), "docw-lo-"));
  try {
    const input = path.join(dir, "input");
    await writeFile(input, Buffer.from(sourceB64, "base64"));
    const target = format === "docx" ? "docx" : "pdf";
    // A private profile dir avoids the "another LibreOffice is running" lock.
    const r = await run("soffice", ["--headless", `-env:UserInstallation=file://${path.join(dir, "profile")}`, "--convert-to", target, "--outdir", dir, input], dir);
    if (!r.ok) return { error: r.error };
    const out = await readFile(path.join(dir, `input.${target}`)).catch(() => null);
    if (!out) return { error: `LibreOffice produced no .${target} (unsupported input format?).` };
    return { bytes: out, contentType: target === "docx" ? DOCX_MIME : "application/pdf" };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error("payload too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") return json(res, 200, { ok: true });
  if (req.method !== "POST" || (req.url ?? "").split("?")[0] !== "/render") return json(res, 404, { error: "not found" });
  if (TOKEN) {
    const auth = req.headers["authorization"] || "";
    if (auth !== `Bearer ${TOKEN}`) return json(res, 401, { error: "unauthorized" });
  }
  let body;
  try { body = JSON.parse((await readBody(req)).toString("utf8") || "{}"); }
  catch (e) { return json(res, 400, { error: `bad request: ${e.message}` }); }

  const engine = body.engine === "libreoffice" ? "libreoffice" : "latex";
  const source = typeof body.source === "string" ? body.source : "";
  if (!source.trim()) return json(res, 400, { error: "missing 'source'" });

  try {
    const result = engine === "libreoffice"
      ? await renderLibreOffice(source, body.format === "docx" ? "docx" : "pdf")
      : await renderLatex(source);
    if (result.error || !result.bytes) return json(res, 422, { error: result.error ?? "render failed" });
    res.writeHead(200, { "Content-Type": result.contentType, "Content-Length": result.bytes.length });
    res.end(result.bytes);
  } catch (e) {
    json(res, 500, { error: `internal: ${e.message}` });
  }
});

server.listen(PORT, () => console.log(`[doc-worker] listening on :${PORT} (auth ${TOKEN ? "on" : "OFF"})`));

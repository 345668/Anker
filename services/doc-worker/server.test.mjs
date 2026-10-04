// Run: node --test services/doc-worker/server.test.mjs
// Uses a fake `soffice` script so the protocol, auth, validation and concurrency are tested without LibreOffice.
// (The real conversion is exercised by the container smoke test in README.md.)
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWorker, inputExtension, planConversion, sanitizeName } from "./server.mjs";

const dir = mkdtempSync(path.join(tmpdir(), "fake-soffice-"));
const fake = path.join(dir, "soffice");
// Records its arguments, "converts" by copying the input to the requested extension, optionally sleeping or failing.
writeFileSync(fake, `#!/bin/sh
if [ "$1" = "--version" ]; then echo "LibreOffice fake"; exit 0; fi
ARGS="$*"
echo "$ARGS" >> "${dir}/calls.log"
OUT=""; IN=""; PREV=""; FMT=""
for a in "$@"; do
  [ "$PREV" = "--outdir" ] && OUT="$a"
  [ "$PREV" = "--convert-to" ] && FMT="$a"
  PREV="$a"; IN="$a"
done
grep -q FAILME "$IN" && { echo "boom" >&2; exit 3; }
grep -q SLOW "$IN" && sleep 2
EXT=$(echo "$FMT" | cut -d: -f1)
BASE=$(basename "$IN"); BASE="\${BASE%.*}"
[ "$EXT" = "nothing" ] && exit 0
cp "$IN" "$OUT/$BASE.$EXT"
`);
chmodSync(fake, 0o755);

const start = (opts = {}) => new Promise((resolve) => {
  const s = createWorker({ token: "t0k", soffice: fake, timeoutMs: 5000, ...opts });
  s.listen(0, () => resolve({ s, url: `http://127.0.0.1:${s.address().port}` }));
});
const post = (url, body, token = "t0k") => fetch(`${url}/render`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const b64 = (s) => Buffer.from(s).toString("base64");

test("pure planning", () => {
  assert.equal(sanitizeName("../../etc/pa ss;wd.docx"), "pa ss_wd.docx");
  assert.equal(inputExtension("Report.DOCX", Buffer.from("PK")), "docx");
  assert.equal(inputExtension("noext", Buffer.from("%PDF-1.7 ...")), "pdf");
  assert.equal(inputExtension("evil.exe", Buffer.from("MZ")), "docx");
  assert.deepEqual(planConversion("docx", "pdf"), { target: "pdf", infilter: null, convertTo: "pdf" });
  assert.equal(planConversion("pdf", "docx").infilter, "writer_pdf_import");
  assert.ok(planConversion("pdf", "pdf").error);
  assert.ok(planConversion("docx", "docx").error);
});

test("health, 404 and auth", async () => {
  const { s, url } = await start();
  try {
    const h = await (await fetch(`${url}/health`)).json();
    assert.equal(h.ok, true); assert.equal(h.soffice, true);
    assert.equal((await fetch(`${url}/nope`)).status, 404);
    assert.equal((await post(url, { engine: "libreoffice", source: b64("x") }, null)).status, 401);
    assert.equal((await post(url, { engine: "libreoffice", source: b64("x") }, "wrong")).status, 401);
    assert.equal((await post(url, { engine: "libreoffice" })).status, 400);
  } finally { s.close(); }
});

test("converts Word to PDF and PDF to Word with the right arguments", async () => {
  const { s, url } = await start();
  try {
    let r = await post(url, { engine: "libreoffice", source: b64("hello docx"), filename: "a.docx", format: "pdf" });
    assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "application/pdf"); assert.equal(await r.text(), "hello docx");
    r = await post(url, { engine: "libreoffice", source: b64("%PDF-1.4 x"), filename: "a.pdf", format: "docx" });
    assert.equal(r.status, 200); assert.match(r.headers.get("content-type"), /wordprocessingml/);
    const calls = readFileSync(path.join(dir, "calls.log"), "utf8");
    assert.match(calls, /--convert-to pdf /); assert.match(calls, /--infilter=writer_pdf_import/); assert.match(calls, /docx:MS Word 2007 XML/);
    assert.match(calls, /--headless --norestore --nolockcheck -env:UserInstallation=file:\/\//);
  } finally { s.close(); }
});

test("rejects unsupported combinations and surfaces converter failures", async () => {
  const { s, url } = await start();
  try {
    assert.equal((await post(url, { engine: "libreoffice", source: b64("%PDF-1.4"), filename: "a.pdf", format: "pdf" })).status, 400);
    assert.equal((await post(url, { engine: "libreoffice", source: b64("x"), filename: "a.docx", format: "docx" })).status, 400);
    const bad = await post(url, { engine: "libreoffice", source: b64("FAILME"), filename: "a.docx" });
    assert.equal(bad.status, 422); assert.match((await bad.json()).error, /exited 3/);
  } finally { s.close(); }
});

test("a filename cannot escape the temp dir or inject arguments", async () => {
  const { s, url } = await start();
  try {
    const r = await post(url, { engine: "libreoffice", source: b64("x"), filename: "--outdir=/etc/../x.docx" });
    assert.equal(r.status, 200);
    const calls = readFileSync(path.join(dir, "calls.log"), "utf8").trim().split("\n").pop();
    assert.ok(!calls.includes("--outdir=/etc")); assert.match(calls, /input\.docx/);
  } finally { s.close(); }
});

test("too large a body is refused", async () => {
  const { s, url } = await start({ maxBody: 1000 });
  try { assert.equal((await post(url, { engine: "libreoffice", source: b64("x".repeat(5000)) })).status, 413); } finally { s.close(); }
});

test("a conversion that outlives the timeout is killed", async () => {
  const { s, url } = await start({ timeoutMs: 500 });
  try {
    const r = await post(url, { engine: "libreoffice", source: b64("SLOW"), filename: "a.docx" });
    assert.equal(r.status, 504);
  } finally { s.close(); }
});

test("concurrency is capped and the queue overflows with 429", async () => {
  const { s, url } = await start({ concurrency: 1, maxQueue: 1 });
  try {
    const slow = () => post(url, { engine: "libreoffice", source: b64("SLOW"), filename: "a.docx" });
    const results = await Promise.all([slow(), slow(), slow()]);
    const codes = results.map((r) => r.status).sort();
    assert.deepEqual(codes, [200, 200, 429]);
  } finally { s.close(); }
});

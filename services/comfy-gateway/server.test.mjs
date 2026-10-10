// Run: node --test services/comfy-gateway/server.test.mjs
// A fake ComfyUI stands in for the worker, so the gateway's auth, route allow-list, workflow checks and limits are tested without GPU or weights.
import test from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import { createGateway, workflowProblem } from "./server.mjs"

const seen = []
const worker = http.createServer((req, res) => {
  const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => {
    seen.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString("utf8") })
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, url: req.url }))
  })
})
const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(s.address().port)))
const wport = await listen(worker)
const log = []
const gw = createGateway({ keys: ["k1", "k2"], adminKey: "admin", allowedNodes: ["EmptyImage", "SaveImage"], upstream: `http://127.0.0.1:${wport}`, ratePerMin: 1000, log: (l) => log.push(l) })
const gport = await listen(gw)
const call = (path, o = {}) => fetch(`http://127.0.0.1:${gport}${path}`, { ...o, headers: { ...(o.key === null ? {} : { "x-api-key": o.key ?? "k1" }), ...(o.headers ?? {}) } })
const J = "11111111-2222-3333-4444-555555555555"
const wf = (over = {}) => ({ prompt_id: J, prompt: { "1": { class_type: "EmptyImage", inputs: { width: 512, height: 288, batch_size: 1, color: 1 } }, "2": { class_type: "SaveImage", inputs: { images: ["1", 0], filename_prefix: "anker" } } }, ...over })
const post = (body, o = {}) => call("/prompt", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" }, ...o })
const slow = createGateway({ keys: ["k3"], allowedNodes: [], upstream: `http://127.0.0.1:${wport}`, ratePerMin: 5 })
const sport = await listen(slow)
test.after(() => { gw.close(); slow.close(); worker.close() })

test("health is open; everything else needs a key", async () => {
  assert.equal((await call("/health", { key: null })).status, 200)
  assert.equal((await call("/system_stats", { key: null })).status, 401)
  assert.equal((await call("/system_stats", { key: "wrong" })).status, 401)
  assert.equal((await call("/system_stats", { key: "k2" })).status, 200)
})
test("only the listed routes are reachable; ComfyUI's file, settings, model and user routes are not", async () => {
  for (const p of ["/userdata", "/users", "/settings", "/models", "/experiment/models", "/extensions", "/object_info", "/history", "/view_metadata/x", "/free", "/api/jobs", "/"]) assert.equal((await call(p)).status, 404, p)
  for (const p of ["/free", "/history", "/queue", "/settings", "/upload/mask", "/userdata/x"]) assert.equal((await call(p, { method: "POST", body: "{}" })).status, 404, `POST ${p}`)
  assert.equal(seen.length, 1) // only system_stats earlier ever reached the worker
})
test("interrupt and cancel are admin-only", async () => {
  assert.equal((await call("/interrupt", { method: "POST" })).status, 403)
  assert.equal((await call(`/api/jobs/${J}/cancel`, { method: "POST", headers: { "x-admin-key": "nope" } })).status, 403)
  assert.equal((await call("/interrupt", { method: "POST", headers: { "x-admin-key": "admin" } })).status, 200)
})
test("a workflow runs only if every node is allowed and every value is plain", async () => {
  assert.equal((await post(wf())).status, 200)
  const forwarded = JSON.parse(seen.at(-1).body); assert.equal(forwarded.prompt_id, J)
  for (const [name, body] of [
    ["unknown node", wf({ prompt: { "1": { class_type: "LoadImage", inputs: { image: "a.png" } } } })],
    ["extra field", wf({ extra_data: { x: 1 } })],
    ["path in a value", wf({ prompt: { "1": { class_type: "EmptyImage", inputs: { width: 1, height: 1, batch_size: 1, color: "../../etc/passwd" } } } })],
    ["absolute path", wf({ prompt: { "1": { class_type: "SaveImage", inputs: { images: ["1", 0], filename_prefix: "/tmp/x" } } } })],
    ["url", wf({ prompt: { "1": { class_type: "SaveImage", inputs: { images: ["1", 0], filename_prefix: "http://evil/x" } } } })],
    ["dangling link", wf({ prompt: { "1": { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: "x" } } } })],
    ["object value", wf({ prompt: { "1": { class_type: "EmptyImage", inputs: { width: { a: 1 }, height: 1, batch_size: 1, color: 1 } } } })],
    ["bad id", wf({ prompt_id: "not a uuid!" })],
    ["empty", wf({ prompt: {} })],
  ]) assert.equal((await post(body)).status, 400, name)
  assert.equal((await post("[1]")).status, 400)
  assert.equal((await call("/prompt", { method: "POST", body: "not json", headers: { "content-type": "application/json" } })).status, 400)
})
test("workflowProblem enforces the node cap", () => {
  const g = {}; for (let i = 0; i < 6; i++) g[String(i)] = { class_type: "EmptyImage", inputs: {} }
  assert.match(workflowProblem({ prompt: g }, new Set(["EmptyImage"]), 5), /1 to 5 nodes/)
})
test("file references are bounded to plain names in the output or input folders", async () => {
  assert.equal((await call("/view?filename=a.png&subfolder=&type=output")).status, 200)
  for (const q of ["filename=../a.png", "filename=a/b.png", "filename=a.png&type=temp", "filename=a.png&subfolder=..", "filename=", "filename=a%5Cb.png"]) assert.equal((await call(`/view?${q}`)).status, 400, q)
})
test("uploads must be multipart and are size-capped", async () => {
  assert.equal((await call("/upload/image", { method: "POST", body: "x", headers: { "content-type": "application/json" } })).status, 400)
  assert.equal((await call("/upload/image", { method: "POST", body: "x", headers: { "content-type": "multipart/form-data; boundary=abc" } })).status, 200)
  assert.equal((await post({ big: "x".repeat(1.2 * 1024 * 1024) })).status, 413)
})
test("a key is rate limited, and logs carry no bodies", async () => {
  let last = 200; for (let i = 0; i < 8; i++) last = (await fetch(`http://127.0.0.1:${sport}/queue`, { headers: { "x-api-key": "k3" } })).status
  assert.equal(last, 429)
  assert.ok(log.length > 10); assert.ok(log.every((l) => !("body" in l) && !JSON.stringify(l).includes("EmptyImage")))
})

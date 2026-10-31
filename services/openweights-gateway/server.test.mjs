import { test } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import { createGateway, bodyProblem, ROUTES } from "./server.mjs"

const start = (server) => new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)))
async function setup(over = {}) {
  const seen = []
  const engine = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { seen.push({ method: req.method, url: req.url, body: b }); res.writeHead(over.engineStatus ?? 200, { "Content-Type": "application/json" }); res.end(over.engineBody ?? JSON.stringify({ choices: [{ message: { content: "ANSWER-TEXT" } }], usage: { prompt_tokens: 11, completion_tokens: 3 } })) }) })
  const eport = await start(engine), logs = []
  const gw = createGateway({ keys: ["k1", "k2"], allowedModels: ["Qwen/Qwen3-8B"], upstream: `http://127.0.0.1:${eport}`, log: (l) => logs.push(l), ratePerMin: over.rate ?? 100, timeoutMs: over.timeoutMs ?? 5000 })
  const gport = await start(gw)
  const call = (method, path, { key = "k1", body } = {}) => fetch(`http://127.0.0.1:${gport}${path}`, { method, headers: { ...(key ? { "x-api-key": key } : {}), "Content-Type": "application/json" }, ...(body !== undefined && method !== "GET" && method !== "HEAD" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) })
  return { call, seen, logs, close: () => { gw.close(); engine.close() } }
}
const chat = (extra = {}) => ({ model: "Qwen/Qwen3-8B", messages: [{ role: "user", content: "SECRET-PROMPT hello" }], max_tokens: 100, ...extra })

test("health is open; everything else needs a key; a wrong key is refused before the engine is touched", async () => {
  const g = await setup()
  assert.equal((await g.call("GET", "/health", { key: null })).status, 200)
  assert.equal((await g.call("GET", "/v1/models", { key: null })).status, 401); assert.equal((await g.call("GET", "/v1/models", { key: "nope" })).status, 401); assert.equal((await g.call("POST", "/v1/chat/completions", { key: "nope", body: chat() })).status, 401)
  assert.equal(g.seen.length, 0); g.close()
})
test("only the three routes exist: no streaming endpoint, no admin, no path tricks", async () => {
  const g = await setup()
  for (const [m, p] of [["GET", "/v1/completions"], ["POST", "/v1/completions"], ["GET", "/metrics"], ["POST", "/v1/chat/completions/../models"], ["DELETE", "/v1/models"], ["POST", "/pooling"]]) assert.equal((await g.call(m, p, { body: {} })).status, 404, `${m} ${p}`)
  assert.equal(g.seen.length, 0); assert.equal(ROUTES.length, 4); g.close()
})
test("a good chat request is forwarded and the answer returned; the key and prompt never reach the log", async () => {
  const g = await setup(), r = await g.call("POST", "/v1/chat/completions", { body: chat() }), j = await r.json()
  assert.equal(r.status, 200); assert.equal(j.choices[0].message.content, "ANSWER-TEXT"); assert.equal(g.seen[0].url, "/v1/chat/completions")
  const line = JSON.stringify(g.logs); assert.match(line, /"code":200/); assert.match(line, /"promptTokens":11/); assert.doesNotMatch(line, /SECRET-PROMPT|ANSWER-TEXT|k1|k2/); g.close()
})
test("bad bodies are refused with a reason and never forwarded", async () => {
  const g = await setup(), bad = async (b) => (await g.call("POST", "/v1/chat/completions", { body: b })).status
  assert.equal(await bad(chat({ model: "other/model" })), 400); assert.equal(await bad(chat({ stream: true })), 400); assert.equal(await bad(chat({ max_tokens: 999999 })), 400); assert.equal(await bad(chat({ temperature: 9 })), 400)
  assert.equal(await bad(chat({ tools: [] })), 400); assert.equal(await bad({ model: "Qwen/Qwen3-8B", messages: [] }), 400); assert.equal(await bad(chat({ messages: [{ role: "tool", content: "x" }] })), 400)
  assert.equal(await bad(chat({ response_format: { type: "json_schema" } })), 400); assert.equal((await g.call("POST", "/v1/chat/completions", { body: "{not json" })).status, 400); assert.equal(await bad([1]), 400)
  assert.equal(g.seen.length, 0); assert.equal(await bad(chat({ response_format: { type: "json_object" }, temperature: 0.2 })), 200); g.close()
})
test("oversized bodies are refused; rate limits apply per key", async () => {
  const g = await setup({ rate: 3 })
  assert.equal((await g.call("POST", "/v1/chat/completions", { body: chat({ messages: [{ role: "user", content: "x".repeat(2 * 1024 * 1024) }] }) })).status, 413)
  const codes = []; for (let i = 0; i < 5; i++) codes.push((await g.call("GET", "/v1/models", { key: "k2" })).status); assert.deepEqual(codes, [200, 200, 200, 429, 429]); assert.equal((await g.call("GET", "/v1/models", { key: "k1" })).status, 200); g.close()
})
test("an engine that is down or too slow is a clear gateway error, not a hang", async () => {
  const g = await setup({ timeoutMs: 150, engineBody: "x" })
  const slowEngine = http.createServer(() => {}); const sp = await start(slowEngine)
  const gw2 = createGateway({ keys: ["k"], allowedModels: ["Qwen/Qwen3-8B"], upstream: `http://127.0.0.1:${sp}`, timeoutMs: 150 }); const p2 = await start(gw2)
  const r = await fetch(`http://127.0.0.1:${p2}/v1/chat/completions`, { method: "POST", headers: { "x-api-key": "k", "Content-Type": "application/json" }, body: JSON.stringify(chat()) }); assert.equal(r.status, 504); assert.match((await r.json()).error, /in time/)
  const gw3 = createGateway({ keys: ["k"], allowedModels: ["Qwen/Qwen3-8B"], upstream: "http://127.0.0.1:1", timeoutMs: 500 }); const p3 = await start(gw3)
  const r3 = await fetch(`http://127.0.0.1:${p3}/v1/models`, { headers: { "x-api-key": "k" } }); assert.equal(r3.status, 502); gw2.closeAllConnections?.(); gw2.close(); gw3.close(); slowEngine.closeAllConnections?.(); slowEngine.close(); g.close()
})
test("bodyProblem: embeddings take 1 to 64 strings", () => {
  const ok = new Set(["m"]); assert.equal(bodyProblem("embed", { model: "m", input: ["a"] }, ok), null); assert.match(bodyProblem("embed", { model: "m", input: [] }, ok), /1 to 64/); assert.match(bodyProblem("embed", { model: "m", input: [1] }, ok), /1 to 64/)
})

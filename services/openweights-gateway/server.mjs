// The only way to reach the language-model engine (vLLM). The engine has no login and must never be on the internet; Anker calls this gateway, which checks an API key, allows exactly three
// routes, caps sizes, rates and time, validates the request body, and forwards to the private engine. It never logs a prompt or an answer: only method, path, status, timing and token counts.
// docs/architecture/53 section 4.2.  Run: GATEWAY_API_KEYS=k1 ALLOWED_MODELS=Qwen/Qwen3-8B OW_UPSTREAM=http://127.0.0.1:8000 node server.mjs
import http from "node:http"
import { timingSafeEqual } from "node:crypto"
import { pathToFileURL } from "node:url"

const MB = 1024 * 1024
export const ROUTES = [
  { method: "GET", re: /^\/health$/, open: true },
  { method: "GET", re: /^\/v1\/models$/ },
  { method: "POST", re: /^\/v1\/chat\/completions$/, check: "chat", limit: 1 * MB },
  { method: "POST", re: /^\/v1\/embeddings$/, check: "embed", limit: 1 * MB },
]
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y) }

/** Why a request body may not be forwarded, or null. Only known fields, bounded values, an allowed model, and no streaming (a stream would hold the connection and bypass the time cap). */
export function bodyProblem(kind, body, allowedModels, caps = {}) {
  const maxTokens = caps.maxTokens ?? 4096, maxChars = caps.maxChars ?? 400_000
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Send a JSON object."
  const fields = kind === "chat" ? ["model", "messages", "max_tokens", "temperature", "response_format", "top_p", "stop"] : ["model", "input"]
  for (const k of Object.keys(body)) if (!fields.includes(k)) return `Field "${k}" is not accepted.`
  if (typeof body.model !== "string" || !allowedModels.has(body.model)) return "That model is not available here."
  if (kind === "embed") { const xs = [].concat(body.input ?? []); return xs.length && xs.length <= 64 && xs.every((x) => typeof x === "string" && x.length <= 20_000) ? null : "input must be 1 to 64 strings." }
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 64) return "messages must be 1 to 64 items."
  let chars = 0
  for (const m of body.messages) {
    if (!m || typeof m !== "object" || !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string") return "Each message needs a role and text content."
    chars += m.content.length
  }
  if (chars > maxChars) return "The conversation is too long."
  if (body.max_tokens !== undefined && !(Number.isInteger(body.max_tokens) && body.max_tokens >= 1 && body.max_tokens <= maxTokens)) return `max_tokens must be a whole number from 1 to ${maxTokens}.`
  if (body.temperature !== undefined && !(typeof body.temperature === "number" && body.temperature >= 0 && body.temperature <= 2)) return "temperature must be between 0 and 2."
  if (body.response_format !== undefined && !(body.response_format && body.response_format.type === "json_object" && Object.keys(body.response_format).length === 1)) return "response_format may only be json_object."
  return null
}

export function createGateway(opt) {
  const keys = (opt.keys ?? []).filter(Boolean), allowed = new Set(opt.allowedModels ?? []), upstream = String(opt.upstream).replace(/\/+$/, "")
  const ratePerMin = opt.ratePerMin ?? 120, log = opt.log ?? (() => {}), hits = new Map(), fetchImpl = opt.fetchImpl ?? fetch
  const limited = (key) => { const now = Date.now(), win = (hits.get(key) ?? []).filter((t) => now - t < 60000); win.push(now); hits.set(key, win); return win.length > ratePerMin }
  const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)) }
  const readBody = (req, limit) => new Promise((resolve, reject) => {
    const chunks = []; let n = 0
    req.on("data", (c) => { n += c.length; if (n > limit) { reject(Object.assign(new Error("too large"), { code: 413 })); req.destroy() } else chunks.push(c) })
    req.on("end", () => resolve(Buffer.concat(chunks))); req.on("error", reject)
  })
  return http.createServer(async (req, res) => {
    const started = Date.now(), path = new URL(req.url, "http://x").pathname
    const done = (code, extra = {}) => log({ method: req.method, path, code, ms: Date.now() - started, ...extra })      // never a prompt, an answer or a key
    try {
      const route = ROUTES.find((r) => r.method === req.method && r.re.test(path))
      if (!route) { done(404); return send(res, 404, { error: "Not found." }) }
      if (route.open) { done(200); return send(res, 200, { ok: true, models: allowed.size }) }
      const given = req.headers["x-api-key"]
      if (!keys.length || typeof given !== "string" || !keys.some((k) => eq(given, k))) { done(401); return send(res, 401, { error: "Unauthorized." }) }
      if (limited(given)) { done(429); return send(res, 429, { error: "Too many requests." }) }
      let payload
      if (route.method === "POST") {
        if (Number(req.headers["content-length"]) > route.limit) { done(413); return send(res, 413, { error: "Too large." }) }
        const raw = await readBody(req, route.limit)
        let j; try { j = JSON.parse(raw.toString("utf8")) } catch { done(400, { why: "json" }); return send(res, 400, { error: "Send valid JSON." }) }
        const why = bodyProblem(route.check, j, allowed, opt.caps)
        if (why) { done(400, { why: "body" }); return send(res, 400, { error: why }) }
        payload = JSON.stringify(j)
      }
      const r = await fetchImpl(upstream + path, { method: req.method, redirect: "error", signal: AbortSignal.timeout(opt.timeoutMs ?? 120_000), headers: payload ? { "Content-Type": "application/json" } : {}, ...(payload ? { body: payload } : {}) })
      const out = Buffer.from(await r.arrayBuffer())
      let tokens = {}; try { const u = JSON.parse(out.toString("utf8")).usage; if (u) tokens = { promptTokens: u.prompt_tokens, outputTokens: u.completion_tokens } } catch { /* not JSON */ }
      res.writeHead(r.status, { "Content-Type": r.headers.get("content-type") ?? "application/json", "Content-Length": out.length, "Cache-Control": "no-store" })
      res.end(out); done(r.status, tokens)
    } catch (e) {
      const code = e?.code === 413 ? 413 : e?.name === "TimeoutError" ? 504 : 502
      done(code, { why: String(e?.name ?? "error") }); if (!res.headersSent) send(res, code, { error: code === 413 ? "Too large." : code === 504 ? "The model did not answer in time." : "The model engine is not reachable." })
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const models = (process.env.ALLOWED_MODELS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const keys = (process.env.GATEWAY_API_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  if (!keys.length || !models.length) { console.error("GATEWAY_API_KEYS and ALLOWED_MODELS are required."); process.exit(1) }
  createGateway({ keys, allowedModels: models, upstream: process.env.OW_UPSTREAM ?? "http://127.0.0.1:8000", ratePerMin: Number(process.env.RATE_PER_MIN) || 120, timeoutMs: Number(process.env.TIMEOUT_MS) || 120_000, log: (l) => console.log(JSON.stringify(l)) })
    .listen(Number(process.env.PORT) || 8080, "0.0.0.0", () => console.log("openweights-gateway listening"))
}

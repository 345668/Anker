// The only way to reach ComfyUI. ComfyUI has no login and can run any installed node, so it is never exposed: Anker calls this gateway, which checks an
// API key, allows a short list of routes, validates the workflow against a node allow-list, caps sizes and rates, and forwards to the private worker.
// docs/architecture/49 section 5.  Run: GATEWAY_API_KEYS=k1 ALLOWED_NODES=EmptyImage,SaveImage COMFY_UPSTREAM=http://127.0.0.1:8188 node server.mjs
import http from "node:http"
import { timingSafeEqual } from "node:crypto"
import { pathToFileURL } from "node:url"

const UUID = "[0-9a-fA-F-]{8,64}"
const MB = 1024 * 1024
const NAME = /^[A-Za-z0-9._ -]{1,200}$/
const bad = (v) => typeof v !== "string" || v.includes("..") || v.includes("/") || v.includes("\\") || v.includes("\0")

/** Static route table. `admin` routes need the admin key as well. */
export const ROUTES = [
  { method: "GET", re: /^\/health$/, open: true },
  { method: "GET", re: /^\/system_stats$/ },
  { method: "GET", re: new RegExp(`^/api/jobs/${UUID}$`) },
  { method: "GET", re: new RegExp(`^/history/${UUID}$`) },
  { method: "GET", re: /^\/queue$/ },
  { method: "GET", re: /^\/view$/, check: "view" },
  { method: "POST", re: /^\/prompt$/, check: "prompt", limit: 1 * MB },
  { method: "POST", re: /^\/upload\/image$/, check: "upload", limit: 25 * MB },
  { method: "POST", re: /^\/interrupt$/, admin: true },
  { method: "POST", re: new RegExp(`^/api/jobs/${UUID}/cancel$`), admin: true },
]

const eq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Why a workflow may not run, or null. Node names come from the allow-list, values are bounded, and nothing may point at a path. */
export function workflowProblem(body, allowed, maxNodes = 200) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Send a JSON object."
  for (const k of Object.keys(body)) if (!["prompt", "prompt_id", "client_id"].includes(k)) return `Field "${k}" is not accepted.`
  const g = body.prompt
  if (!g || typeof g !== "object" || Array.isArray(g)) return "prompt must be a workflow object."
  const ids = Object.keys(g)
  if (!ids.length || ids.length > maxNodes) return `A workflow has 1 to ${maxNodes} nodes.`
  if (body.prompt_id !== undefined && !(typeof body.prompt_id === "string" && new RegExp(`^${UUID}$`).test(body.prompt_id))) return "prompt_id must be a UUID."
  for (const id of ids) {
    const n = g[id]
    if (!n || typeof n.class_type !== "string" || !allowed.has(n.class_type)) return `Node "${n?.class_type}" is not allowed.`
    if (!n.inputs || typeof n.inputs !== "object" || Array.isArray(n.inputs)) return `Node ${id} has no inputs.`
    for (const [k, v] of Object.entries(n.inputs)) {
      if (typeof v === "string") {
        if (v.length > 8000) return `Input ${k} is too long.`
        if (/(^|[\\/])\.\.([\\/]|$)/.test(v) || v.startsWith("/") || /^[a-z]+:\/\//i.test(v)) return `Input ${k} looks like a path or URL.`
      } else if (Array.isArray(v)) {
        if (v.length !== 2 || typeof v[0] !== "string" || !Number.isInteger(v[1]) || !(v[0] in g)) return `Input ${k} links to nothing.`
      } else if (!(typeof v === "number" || typeof v === "boolean")) return `Input ${k} has an unsupported value.`
    }
  }
  return null
}

export function createGateway(opt) {
  const keys = (opt.keys ?? []).filter(Boolean), adminKey = opt.adminKey ?? "", allowed = new Set(opt.allowedNodes ?? [])
  const upstream = String(opt.upstream).replace(/\/+$/, ""), ratePerMin = opt.ratePerMin ?? 120, log = opt.log ?? (() => {})
  const hits = new Map()
  const limited = (key) => {
    const now = Date.now(), win = (hits.get(key) ?? []).filter((t) => now - t < 60000)
    win.push(now); hits.set(key, win)
    return win.length > ratePerMin
  }
  const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)) }
  const readBody = (req, limit) => new Promise((resolve, reject) => {
    const chunks = []; let n = 0
    req.on("data", (c) => { n += c.length; if (n > limit) { reject(Object.assign(new Error("too large"), { code: 413 })); req.destroy() } else chunks.push(c) })
    req.on("end", () => resolve(Buffer.concat(chunks))); req.on("error", reject)
  })
  return http.createServer(async (req, res) => {
    const started = Date.now(), url = new URL(req.url, "http://x"), path = url.pathname
    const done = (code, why) => log({ method: req.method, path: path.replace(new RegExp(UUID, "g"), ":id"), code, ms: Date.now() - started, why })
    try {
      const route = ROUTES.find((r) => r.method === req.method && r.re.test(path))
      if (!route) { done(404); return send(res, 404, { error: "Not found." }) }
      if (route.open) { done(200); return send(res, 200, { ok: true }) }
      const given = req.headers["x-api-key"]
      if (!keys.length || typeof given !== "string" || !keys.some((k) => eq(given, k))) { done(401); return send(res, 401, { error: "Unauthorized." }) }
      if (route.admin && !(adminKey && eq(req.headers["x-admin-key"] ?? "", adminKey))) { done(403); return send(res, 403, { error: "Admin only." }) }
      if (limited(given)) { done(429); return send(res, 429, { error: "Too many requests." }) }
      let body
      if (route.method === "POST") {
        if (Number(req.headers["content-length"]) > (route.limit ?? 64 * 1024)) { done(413); return send(res, 413, { error: "Too large." }) }
        body = await readBody(req, route.limit ?? 64 * 1024)
      }
      if (route.check === "view") {
        const q = url.searchParams, f = q.get("filename") ?? "", sub = q.get("subfolder") ?? "", t = q.get("type") ?? "output"
        if (!NAME.test(f) || bad(f) || (sub && (!NAME.test(sub) || bad(sub))) || !["output", "input"].includes(t)) { done(400, "view"); return send(res, 400, { error: "Invalid file reference." }) }
      }
      if (route.check === "prompt") {
        let j; try { j = JSON.parse(body.toString("utf8")) } catch { done(400, "json"); return send(res, 400, { error: "Send valid JSON." }) }
        const why = workflowProblem(j, allowed)
        if (why) { done(400, "workflow"); return send(res, 400, { error: why }) }
      }
      if (route.check === "upload" && !/^multipart\/form-data;\s*boundary=/i.test(req.headers["content-type"] ?? "")) { done(400, "upload"); return send(res, 400, { error: "Send a multipart upload." }) }
      const r = await fetch(upstream + path + url.search, {
        method: req.method, redirect: "error", signal: AbortSignal.timeout(opt.timeoutMs ?? 60000),
        headers: body ? { "Content-Type": req.headers["content-type"] ?? "application/octet-stream" } : {}, ...(body ? { body } : {}),
      })
      const out = Buffer.from(await r.arrayBuffer())
      res.writeHead(r.status, { "Content-Type": r.headers.get("content-type") ?? "application/octet-stream", "Content-Length": out.length, "Cache-Control": "no-store" })
      res.end(out); done(r.status)
    } catch (e) {
      const code = e?.code === 413 ? 413 : 502
      done(code, String(e?.message ?? e).slice(0, 80)); if (!res.headersSent) send(res, code, { error: code === 413 ? "Too large." : "The worker is not reachable." })
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const nodes = (process.env.ALLOWED_NODES ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  const keys = (process.env.GATEWAY_API_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  if (!keys.length || !nodes.length) { console.error("GATEWAY_API_KEYS and ALLOWED_NODES are required."); process.exit(1) }
  createGateway({ keys, adminKey: process.env.GATEWAY_ADMIN_KEY, allowedNodes: nodes, upstream: process.env.COMFY_UPSTREAM ?? "http://127.0.0.1:8188", ratePerMin: Number(process.env.RATE_PER_MIN) || 120, log: (l) => console.log(JSON.stringify(l)) })
    .listen(Number(process.env.PORT) || 8080, "0.0.0.0", () => console.log("comfy-gateway listening"))
}

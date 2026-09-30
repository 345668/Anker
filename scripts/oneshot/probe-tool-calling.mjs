// Throwaway: does this DashScope account accept `tools` for these models?
// One tiny call per model (max_tokens 32). Uses the key already in .env.local —
// the same key the platform uses for the same provider.
import { readFileSync } from "node:fs"
const env = {}
for (const n of [".env.local", ".env"]) {
  try { for (const l of readFileSync(n, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim()
  } } catch {}
}
const key = env.DASHSCOPE_API_KEY || env.QWEN_API_KEY
const ws = env.QWEN_WORKSPACE_ID
const base = ws && ws !== "intl"
  ? `https://${ws}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`
  : "https://dashscope.aliyuncs.com/compatible-mode/v1"
if (!key) { console.log("no key"); process.exit(1) }

const TOOLS = [{
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the weather for a city",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  },
}]
const models = process.argv.slice(2)
for (const model of models) {
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "What is the weather in Berlin? Use the tool." }],
        tools: TOOLS, max_tokens: 32,
      }),
      signal: AbortSignal.timeout(45000),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = (body?.error?.message || JSON.stringify(body)).slice(0, 110)
      console.log(`${model.padEnd(30)} HTTP ${res.status}  ${msg}`)
      continue
    }
    const calls = body?.choices?.[0]?.message?.tool_calls
    console.log(`${model.padEnd(30)} OK    tool_calls=${calls ? calls.length : 0}` +
      (calls?.[0] ? ` -> ${calls[0].function?.name}` : `  (text: ${String(body?.choices?.[0]?.message?.content ?? "").slice(0, 40)})`))
  } catch (e) {
    console.log(`${model.padEnd(30)} ERR   ${String(e?.message).slice(0, 80)}`)
  }
}

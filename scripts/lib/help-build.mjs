// Help article builder (docs/architecture/78 section 4). Pure functions plus a directory walker; no dependencies.
import fs from "node:fs"
import path from "node:path"

export const PERSONAS = ["founder", "vc", "lp", "member", "everyone"]
export const REQUIRED_SECTION = "What it cannot do"

/** Front matter: `key: value`, `key: [a, b]`, between two `---` lines. */
export function parseFrontMatter(src) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(src.replace(/\r\n/g, "\n"))
  if (!m) throw new Error("missing front matter")
  const meta = {}
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line)
    if (!kv) throw new Error(`bad front matter line: ${line}`)
    const v = kv[2].trim()
    if (v.startsWith("[") && v.endsWith("]")) meta[kv[1]] = v.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean)
    else meta[kv[1]] = v.replace(/^"(.*)"$/, "$1")
  }
  return { meta, body: m[2] }
}

/** Tokens resolve from code, never from the author. */
export function loadTokenSources(root) {
  const types = fs.readFileSync(path.join(root, "lib/matching/v2/types.ts"), "utf8")
  const tiers = {}
  for (const m of types.matchAll(/id:\s*"(\w+)",\s*label:\s*"([^"]+)",\s*min:\s*(\d+)/g)) tiers[m[1]] = { label: m[2], min: m[3] }
  const crm = fs.readFileSync(path.join(root, "lib/crm/definitions/types.ts"), "utf8")
  const sm = /CANONICAL_STAGES\s*=\s*\[([^\]]+)\]/.exec(crm)
  const stages = sm ? [...sm[1].matchAll(/"(\w+)"/g)].map((x) => x[1]) : []
  return { tiers, stages }
}

export function resolveTokens(text, src) {
  return text.replace(/\{\{([a-z]+):([\w.]+)\}\}/g, (all, kind, key) => {
    if (kind === "tier") {
      const t = src.tiers[key.replace(/\.min$/, "")]
      if (!t) throw new Error(`unknown token ${all}`)
      return key.endsWith(".min") ? t.min : t.label
    }
    if (kind === "stages" && key === "list") return src.stages.join(", ")
    throw new Error(`unknown token ${all}`)
  })
}

/** Markdown subset to blocks: ## h2, ### h3, paragraphs, - lists, 1. lists. Inline markup stays as text. */
export function toBlocks(body) {
  const blocks = []
  let cur = null
  const flush = () => { if (cur) blocks.push(cur); cur = null }
  for (const raw of body.split("\n")) {
    const line = raw.replace(/\s+$/, "")
    let m
    if (!line.trim()) { flush(); continue }
    if ((m = /^(#{2,3})\s+(.+)$/.exec(line))) { flush(); blocks.push({ t: m[1].length === 2 ? "h2" : "h3", text: m[2] }); continue }
    if (/^#\s/.test(line)) throw new Error("use ## for sections; the title comes from front matter")
    if ((m = /^[-*]\s+(.+)$/.exec(line))) { if (cur?.t !== "ul") { flush(); cur = { t: "ul", items: [] } } cur.items.push(m[1]); continue }
    if ((m = /^\d+\.\s+(.+)$/.exec(line))) { if (cur?.t !== "ol") { flush(); cur = { t: "ol", items: [] } } cur.items.push(m[1]); continue }
    if (cur && (cur.t === "ul" || cur.t === "ol") && /^\s+\S/.test(line)) { cur.items[cur.items.length - 1] += " " + line.trim(); continue }
    if (cur?.t !== "p") { flush(); cur = { t: "p", text: "" } }
    cur.text += (cur.text ? " " : "") + line.trim()
  }
  flush()
  return blocks
}

export const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

export function buildArticle(file, src, tokenSrc) {
  const { meta, body } = parseFrontMatter(fs.readFileSync(file, "utf8"))
  const slug = path.basename(file, ".md")
  const need = ["title", "summary", "personas", "area", "updated"]
  for (const k of need) if (!meta[k] || (Array.isArray(meta[k]) && !meta[k].length)) throw new Error(`${file}: missing ${k}`)
  const blocks = toBlocks(resolveTokens(body, tokenSrc)).map((b) => (b.t === "h2" || b.t === "h3" ? { ...b, id: slugify(b.text) } : b))
  const text = blocks.map((b) => b.text ?? b.items.join(" ")).join(" ")
  return {
    slug, title: meta.title, summary: meta.summary, personas: meta.personas, area: meta.area,
    routes: meta.routes ?? [], feature: meta.feature || null, flag: meta.flag || null, updated: meta.updated,
    related: meta.related ?? [], keywords: meta.keywords ?? [], blocks, text,
  }
}

export function buildAll(root) {
  const dir = path.join(root, "content/help")
  const tokenSrc = loadTokenSources(root)
  const files = []
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".md")) files.push(p) } }
  walk(dir)
  files.sort()
  const articles = files.map((f) => buildArticle(f, tokenSrc, tokenSrc))
  const seen = new Set()
  for (const a of articles) { if (seen.has(a.slug)) throw new Error(`duplicate slug ${a.slug}`); seen.add(a.slug) }
  return { articles }
}

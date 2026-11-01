import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { buildAll, parseFrontMatter, resolveTokens, toBlocks, PERSONAS, REQUIRED_SECTION } from "../../scripts/lib/help-build.mjs"
import { FEATURE_KEYS } from "@/lib/entitlements/model"
import { WORK_AREAS } from "@/lib/nav/work-areas"
import { search, visibleTo } from "./search"
import type { HelpArticle } from "./types"

const root = path.resolve(__dirname, "../..")
const { articles } = buildAll(root) as { articles: HelpArticle[] }
const KNOWN_FLAGS = ["halyard_web", "investor_signup", "listed_for_lps", "onboarding_tour", "help_v2"]
const BANNED = [/\bunlimited\b/i, /\bguarantee[sd]?\b/i, /\binstantly\b/i, /\balways\b/i, /[$€£]\s?\d/, /\b(free trial|enterprise plan)\b/i,
  /\bSign in with a password for your Gmail\b/i, /Book a Demo/i, /Chat with AI/i]

function pages(dir: string, base = ""): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) { if (e.name === "page.tsx") out.push(base || "/"); continue }
    const seg = /^\(.*\)$/.test(e.name) ? "" : "/" + e.name
    out.push(...pages(path.join(dir, e.name), base + seg))
  }
  return out
}
const PAGES = pages(path.join(root, "app"))
const exists = (r: string) => PAGES.some((p) => p === r || (p.includes("[") && new RegExp("^" + p.replace(/\[[^\]]+\]/g, "[^/]+") + "$").test(r)))
const slugs = new Set(articles.map((a) => a.slug))

describe("help articles", () => {
  it("has at least fifteen articles", () => expect(articles.length).toBeGreaterThanOrEqual(15))
  for (const a of articles) {
    describe(a.slug, () => {
      it("has valid personas", () => { for (const p of a.personas) expect(PERSONAS).toContain(p) })
      it("routes are real pages", () => { for (const r of a.routes) expect(exists(r), r).toBe(true) })
      it("feature is a known entitlement key", () => { if (a.feature) expect(FEATURE_KEYS as readonly string[]).toContain(a.feature) })
      it("flag is a known platform flag", () => { if (a.flag) expect(KNOWN_FLAGS).toContain(a.flag) })
      it("has no banned phrase", () => { for (const re of BANNED) expect(a.text, String(re)).not.toMatch(re) })
      it("has no unresolved token", () => expect(a.text).not.toMatch(/\{\{/))
      it("names what it cannot do", () => expect(a.blocks.some((b) => b.t === "h2" && b.text === REQUIRED_SECTION)).toBe(true))
      it("links resolve", () => {
        for (const m of JSON.stringify(a.blocks).matchAll(/\]\((\/[^)]+)\)/g)) {
          const href = m[1]
          if (href.startsWith("/dashboard/help/")) expect(slugs.has(href.split("/").pop()!), href).toBe(true)
          else expect(exists(href), href).toBe(true)
        }
        for (const r of a.related) expect(slugs.has(r), r).toBe(true)
      })
      it("updated is a date", () => expect(Number.isNaN(Date.parse(a.updated))).toBe(false))
    })
  }
})

describe("coverage debt register", () => {
  const debt: { routes: string[] } = JSON.parse(fs.readFileSync(path.join(root, "content/help/_debt.json"), "utf8"))
  const covered = new Set(articles.flatMap((a) => a.routes))
  const all = [...new Set(Object.values(WORK_AREAS).flatMap((v) => v.flatMap(([, rs]) => rs)))]
  it("every work-area route has an article or is on the debt list", () => {
    expect(all.filter((r) => !covered.has(r) && !debt.routes.includes(r))).toEqual([])
  })
  it("the debt list only holds routes that still lack an article", () => {
    expect(debt.routes.filter((r) => covered.has(r) || !all.includes(r))).toEqual([])
  })
})

describe("generated file", () => {
  it("is fresh (run pnpm build:help)", () => {
    const cur = fs.readFileSync(path.join(root, "lib/help/generated.json"), "utf8")
    expect(cur).toBe(JSON.stringify(buildAll(root), null, 1) + "\n")
  })
})

describe("builder", () => {
  it("rejects an unknown token", () => expect(() => resolveTokens("{{tier:nope}}", { tiers: {}, stages: [] })).toThrow())
  it("tier tokens match the code", () => {
    const a = articles.find((x) => x.slug === "find-investors")!
    expect(a.text).toContain("Champion")
    expect(a.text).toContain("80 or above")
  })
  it("requires front matter", () => expect(() => parseFrontMatter("no")).toThrow())
  it("parses blocks", () => expect(toBlocks("## A\n\nhi\n\n- x\n- y")).toEqual([{ t: "h2", text: "A" }, { t: "p", text: "hi" }, { t: "ul", items: ["x", "y"] }]))
})

describe("search", () => {
  const cases: [string, string][] = [
    ["how does the score work", "find-investors"], ["tier", "find-investors"], ["matching", "find-investors"],
    ["pipeline stages", "pipeline"], ["crm", "pipeline"], ["email limit", "outreach"], ["approve drafts", "outreach"],
    ["linkedin extension", "linkedin-outreach"], ["pitch deck", "decks"], ["slides", "decks"], ["data room link", "data-room"],
    ["diligence", "data-room"], ["keyboard shortcut", "command-palette"], ["cmd k", "command-palette"], ["undo", "actions-inbox"],
    ["approve proposal", "actions-inbox"], ["who can see my data", "privacy"], ["invite colleague", "workspaces-and-roles"],
    ["switch workspace", "workspaces-and-roles"], ["ask ai", "assistant"], ["lp requests", "investor-requests"], ["welcome", "welcome"],
  ]
  for (const [q, slug] of cases) it(`"${q}" finds ${slug} in the top three`, () => {
    expect(search(articles, q).slice(0, 3).map((a) => a.slug)).toContain(slug)
  })
  it("returns nothing for nonsense", () => expect(search(articles, "zzzqqq")).toEqual([]))
  it("hides flagged and persona-limited articles", () => {
    const fake = [{ ...articles[0], flag: "halyard_web", personas: ["founder"] }] as HelpArticle[]
    expect(visibleTo(fake, { persona: "founder" })).toEqual([])
    expect(visibleTo(fake, { persona: "founder", flags: { halyard_web: true } })).toHaveLength(1)
    expect(visibleTo(fake, { persona: "lp", flags: { halyard_web: true } })).toEqual([])
  })
})

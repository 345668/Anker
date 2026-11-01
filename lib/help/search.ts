import type { HelpArticle } from "./types"

const SYNONYMS: Record<string, string[]> = {
  lp: ["limited", "partner", "investor"], vc: ["fund"], crm: ["pipeline"], ai: ["assistant"],
  email: ["outreach", "message"], deck: ["pitch", "slides"], price: [], shortcut: ["palette", "keyboard"],
}

export const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
/** Light stemming: plural and -ing/-ed endings. */
export const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, (m) => (w.length - m.length >= 3 ? "" : m))
export const terms = (q: string) => fold(q).split(/[^a-z0-9]+/).filter((t) => t.length > 1).map(stem)

const WEIGHT = { title: 8, keywords: 6, summary: 3, headings: 3, body: 1 }

function fields(a: HelpArticle) {
  return {
    title: terms(a.title), keywords: terms(a.keywords.join(" ")), summary: terms(a.summary),
    headings: terms(a.blocks.filter((b) => b.t === "h2" || b.t === "h3").map((b) => ("text" in b ? b.text : "")).join(" ")),
    body: terms(a.text),
  }
}

export function search(articles: HelpArticle[], query: string): HelpArticle[] {
  const base = terms(query)
  if (!base.length) return []
  const qs = base.flatMap((t) => [t, ...(SYNONYMS[t] ?? []).map(stem)])
  const scored: [HelpArticle, number][] = []
  for (const a of articles) {
    const f = fields(a)
    let score = 0
    let matchedBase = 0
    for (const t of base) {
      let hit = false
      for (const [k, w] of Object.entries(WEIGHT) as [keyof typeof WEIGHT, number][]) {
        if (f[k].some((x) => x === t || (t.length > 3 && x.startsWith(t)))) { score += w; hit = true }
      }
      if (hit) matchedBase++
    }
    for (const t of qs.slice(base.length)) if (f.title.includes(t) || f.keywords.includes(t)) score += 2
    if (matchedBase) scored.push([a, score * (matchedBase / base.length)])
  }
  return scored.sort((x, y) => y[1] - x[1] || x[0].title.localeCompare(y[0].title)).map(([a]) => a)
}

/** Articles visible to this person: persona match, feature on, platform flag on. */
export function visibleTo(articles: HelpArticle[], o: { persona: string; features?: Record<string, boolean>; flags?: Record<string, boolean> }): HelpArticle[] {
  return articles.filter((a) =>
    (a.personas.includes("everyone") || a.personas.includes(o.persona)) &&
    (!a.feature || o.features?.[a.feature] !== false) &&
    (!a.flag || o.flags?.[a.flag] === true))
}

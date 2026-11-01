export type HelpBlock =
  | { t: "h2"; text: string; id: string }
  | { t: "h3"; text: string; id: string }
  | { t: "p"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }

export interface HelpArticle {
  slug: string
  title: string
  summary: string
  personas: string[]
  area: string
  routes: string[]
  feature: string | null
  flag: string | null
  updated: string
  related: string[]
  keywords: string[]
  blocks: HelpBlock[]
  text: string
}

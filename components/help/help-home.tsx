"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { search } from "@/lib/help/search"
import type { HelpArticle } from "@/lib/help/types"

const START = ["welcome", "workspaces-and-roles", "assistant"]

function Row({ a }: { a: HelpArticle }) {
  return (
    <Link href={`/dashboard/help/${a.slug}`} className="block rounded-lg border p-3 hover:bg-muted/50">
      <div className="font-medium">{a.title}</div>
      <div className="text-sm text-muted-foreground">{a.summary}</div>
    </Link>
  )
}

export function HelpHome({ articles, persona }: { articles: HelpArticle[]; persona: string | null }) {
  const [q, setQ] = useState("")
  const hits = useMemo(() => (q.trim() ? search(articles, q) : []), [articles, q])
  const forRole = articles.filter((a) => persona && a.personas.includes(persona)).slice(0, 5)
  const start = START.map((s) => articles.find((a) => a.slug === s)).filter(Boolean) as HelpArticle[]
  const areas = useMemo(() => {
    const m = new Map<string, HelpArticle[]>()
    for (const a of articles) m.set(a.area, [...(m.get(a.area) ?? []), a])
    return [...m.entries()]
  }, [articles])

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Help</h1>
        <p className="text-sm text-muted-foreground">Short guides to what each part of Anker does, and what it does not.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input aria-label="Search help" placeholder="Search help" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      {q.trim() ? (
        <section aria-live="polite" className="space-y-2">
          {hits.length ? hits.map((a) => <Row key={a.slug} a={a} />) : (
            <p className="text-sm text-muted-foreground">No guide matches that. Try fewer or different words, or <Link href="/contact" className="underline">contact us</Link>.</p>
          )}
        </section>
      ) : (
        <>
          {forRole.length > 0 && <section className="space-y-2"><h2 className="font-semibold">For your role</h2>{forRole.map((a) => <Row key={a.slug} a={a} />)}</section>}
          {start.length > 0 && <section className="space-y-2"><h2 className="font-semibold">Start here</h2>{start.map((a) => <Row key={a.slug} a={a} />)}</section>}
          <section className="space-y-4">
            <h2 className="font-semibold">By topic</h2>
            {areas.map(([area, list]) => (
              <div key={area}><h3 className="mb-1 text-sm font-medium text-muted-foreground">{area}</h3><div className="space-y-2">{list.map((a) => <Row key={a.slug} a={a} />)}</div></div>
            ))}
          </section>
        </>
      )}
      <section className="rounded-lg border p-4 text-sm">
        <h2 className="font-semibold">Keyboard</h2>
        <p className="text-muted-foreground">Press Ctrl K (Cmd K on a Mac) to open the command palette from any page.</p>
        <p className="mt-2">Still stuck? <Link href="/contact" className="underline">Contact us</Link>.</p>
      </section>
    </div>
  )
}

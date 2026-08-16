"use client"

/**
 * DecksPowerhouse — /dashboard/decks command surface.
 *
 *   Header  : editorial title + live KPIs (templates, classified, curated,
 *             my decks, filled/exported) + AI-classify (bulk-types the
 *             unclassified backlog, 40 per run)
 *   Tabs    :
 *     Templates : the catalog (search / filter / classify / star / BUILD)
 *     My decks  : every deck you've started — status, template, Figma link,
 *                 last generated — click through to the workroom
 */

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  LayoutTemplate, Layers, Sparkles, Loader2, ExternalLink, Clock,
} from "lucide-react"
import { DecksCatalog } from "./decks-catalog"
import type { DeckTemplate, DeckType } from "@/lib/decks/templates"

export interface MyDeckRow {
  id: string
  status: string
  templateName: string
  deckType: string
  fundName: string | null
  workspaceFileUrl: string | null
  lastFilledAt: string | null
  updatedAt: string
}

interface Props {
  templates: DeckTemplate[]
  counts: Record<DeckType, number>
  activeType: string
  q: string
  only: string
  typeLabels: Record<DeckType, string>
  myDecks: MyDeckRow[]
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  mapping: "bg-blue-100 text-blue-700",
  filled: "bg-violet-100 text-violet-700",
  exported: "bg-emerald-100 text-emerald-700",
  archived: "bg-foreground/5 text-muted-foreground",
}

export function DecksPowerhouse({ templates, counts, activeType, q, only, typeLabels, myDecks }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<"templates" | "mine">("templates")
  const [classifying, setClassifying] = useState(false)
  const [classifyMsg, setClassifyMsg] = useState<string | null>(null)

  const unclassified = counts.unclassified ?? 0
  const classified = templates.length ? Math.round(((templates.length - unclassified) / Math.max(1, templates.length)) * 100) : 0
  const curated = (templates ?? []).filter((t) => t.favorite || t.shortlisted).length
  const live = myDecks.filter((d) => d.status !== "archived")
  const shipped = live.filter((d) => d.status === "filled" || d.status === "exported").length

  async function aiClassify() {
    setClassifying(true); setClassifyMsg(null)
    try {
      const res = await fetch("/api/decks/templates/classify-ai", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Classify failed (${res.status})`)
      setClassifyMsg(`Classified ${data.classified} template(s)${data.remaining ? ` — ${data.remaining} left, run again` : " — backlog clear"}.`)
      router.refresh()
    } catch (e: any) { setClassifyMsg(e?.message ?? "Classify failed") }
    finally { setClassifying(false) }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="px-6 lg:px-10 pt-6 pb-0 border-b border-foreground/10">
        <div className="flex items-end justify-between gap-6 flex-wrap pb-4">
          <div>
            <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              <span className="w-2.5 h-2.5 bg-[#2f45e0]" /> Decks · Figma templates → AI copy → your workspace
            </div>
            <h1 className="text-3xl lg:text-4xl font-serif tracking-tight leading-[1.05]">Deck studio</h1>
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <Kpi label="Templates" value={String(templates.length)} />
            <Kpi label="Classified" value={`${classified}%`} warn={unclassified > 0} />
            <Kpi label="Curated" value={String(curated)} />
            <Kpi label="My decks" value={String(live.length)} />
            <Kpi label="Filled+" value={String(shipped)} />
            {unclassified > 0 && (
              <button onClick={aiClassify} disabled={classifying}
                title={`${unclassified} templates are unclassified — let the AI type them from their names`}
                className="inline-flex items-center gap-2 rounded-full h-9 px-4 border border-foreground/15 hover:bg-foreground/5 text-sm disabled:opacity-50">
                {classifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                AI classify · {unclassified}
              </button>
            )}
          </div>
        </div>
        {classifyMsg && <div className="pb-3 -mt-1 text-xs font-mono text-muted-foreground">{classifyMsg}</div>}

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {([["templates", "Templates", LayoutTemplate, templates.length], ["mine", "My decks", Layers, live.length]] as const).map(([key, label, Icon, n]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 px-4 h-10 text-sm border-b-2 -mb-px transition-colors ${
                tab === key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-4 h-4" />
              {label}
              <span className="font-mono text-[10px] text-muted-foreground">{n}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === "templates" && (
        <DecksCatalog embedded templates={templates} counts={counts} activeType={activeType} q={q} only={only} typeLabels={typeLabels} />
      )}

      {tab === "mine" && (
        <div className="px-6 lg:px-10 py-6">
          {!live.length ? (
            <div className="p-12 text-center text-sm text-muted-foreground border border-foreground/10 rounded-lg">
              No decks yet — pick a classified template and hit <b>Build deck</b>.
            </div>
          ) : (
            <div className="border border-foreground/10 rounded-lg overflow-hidden divide-y divide-foreground/5">
              {live.map((d) => (
                <Link key={d.id} href={`/dashboard/decks/${d.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-foreground/[0.02]">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{d.templateName}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {(d.deckType || "deck").replace(/_/g, " ")}{d.fundName ? ` · ${d.fundName}` : ""}
                    </div>
                  </div>
                  {d.lastFilledAt && (
                    <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                      <Clock className="w-3 h-3" /> filled {new Date(d.lastFilledAt).toLocaleDateString()}
                    </span>
                  )}
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase tracking-wider ${STATUS_STYLE[d.status] ?? "bg-foreground/5"}`}>
                    {d.status}
                  </span>
                  {d.workspaceFileUrl && (
                    <a href={d.workspaceFileUrl} target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-full border border-foreground/15 hover:bg-foreground/5 text-muted-foreground"
                      title="Open in Figma">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="text-right">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl ${warn ? "text-amber-700" : ""}`}>{value}</div>
    </div>
  )
}

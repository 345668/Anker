"use client"

import { useState } from "react"
import { Sparkles, Send, Loader2, Wrench, FileSpreadsheet, FileText, Globe, Search, Target, Database, ChevronDown, ChevronRight, Download } from "lucide-react"

interface Artifact { name: string; url: string; kind: string }
interface Step { thought?: string; tool?: string; input?: any; observation?: string; artifact?: Artifact; error?: string }
interface Result { answer: string; steps: Step[]; artifacts: Artifact[]; provider: string }

const EXAMPLES = [
  "Build an LP shortlist for our $20M emerging-manager fund-of-funds — lesser-known family offices, right-sized, in climate and AI. Produce the XLSX.",
  "Research Gullspång Invest, then draft a one-page intro memo as a Word doc.",
  "Find lesser-known family offices in our database that back fund managers, and rank them.",
  "Web-search the latest on Decile Group, crawl their site, and summarize their thesis.",
]

const toolIcon: Record<string, any> = {
  web_search: Search, web_crawl: Globe, matchmake_lps: Target,
  build_investor_profile: Sparkles, query_investors: Database,
  generate_spreadsheet: FileSpreadsheet, generate_document: FileText,
}

export function AssistantContent() {
  const [task, setTask] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [openSteps, setOpenSteps] = useState(true)

  async function run(prompt?: string) {
    const t = (prompt ?? task).trim()
    if (!t || busy) return
    setBusy(true); setErr(null); setResult(null)
    if (prompt) setTask(prompt)
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: t }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data?.error || "Run failed."); return }
      setResult(data as Result)
    } catch (e: any) {
      setErr(e?.message || "Network error.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-foreground/10 px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl">AI Assistant</h1>
            <p className="text-sm text-muted-foreground">
              Research the web, crawl sites, matchmake LPs, analyze, and generate XLSX / Word deliverables — autonomously.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-6 space-y-6">
        {/* Composer */}
        <div className="border border-foreground/10 rounded-xl p-4">
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe a task — e.g. build an LP shortlist and export it, or research a fund and draft a memo…"
            rows={3}
            className="w-full resize-none bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run() }}
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter to run · uses your local AI + tools</span>
            <button
              onClick={() => run()}
              disabled={busy || !task.trim()}
              className="inline-flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {busy ? "Working…" : "Run"}
            </button>
          </div>
        </div>

        {/* Examples */}
        {!result && !busy && (
          <div className="space-y-2">
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Try</p>
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => run(ex)}
                className="block w-full text-left text-sm border border-foreground/10 rounded-lg px-3 py-2 hover:bg-foreground/5 transition-colors">
                {ex}
              </button>
            ))}
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> The agent is reasoning and calling tools — this can take a minute on local models.
          </div>
        )}

        {err && (
          <div className="border border-red-300 bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm">{err}</div>
        )}

        {result && (
          <div className="space-y-5">
            {result.provider === "no-ai" && (
              <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded-lg px-4 py-3 text-sm">
                No local AI provider reachable — start Ollama or set ANTHROPIC_API_KEY to enable the agent.
              </div>
            )}

            {/* Final answer */}
            <div className="border border-foreground/10 rounded-xl p-5">
              <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Answer</p>
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{result.answer}</div>
            </div>

            {/* Artifacts */}
            {result.artifacts.length > 0 && (
              <div className="border border-foreground/10 rounded-xl p-5">
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3">Generated files</p>
                <div className="space-y-2">
                  {result.artifacts.map((a) => (
                    <a key={a.url} href={a.url} download
                      className="flex items-center gap-2 text-sm text-foreground hover:underline">
                      {a.kind === "xlsx" ? <FileSpreadsheet className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                      {a.name}
                      <Download className="w-3.5 h-3.5 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Steps */}
            {result.steps.length > 0 && (
              <div className="border border-foreground/10 rounded-xl">
                <button onClick={() => setOpenSteps((v) => !v)}
                  className="w-full flex items-center justify-between px-5 py-3 text-sm">
                  <span className="flex items-center gap-2 font-medium"><Wrench className="w-4 h-4" /> Reasoning & tool calls ({result.steps.length})</span>
                  {openSteps ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {openSteps && (
                  <div className="px-5 pb-5 space-y-4">
                    {result.steps.map((s, i) => {
                      const Icon = (s.tool && toolIcon[s.tool]) || Wrench
                      return (
                        <div key={i} className="border-l-2 border-foreground/10 pl-4">
                          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-1">
                            <Icon className="w-3.5 h-3.5" /> {s.tool || "step"} {i + 1}
                          </div>
                          {s.thought && <p className="text-xs text-muted-foreground italic mb-1">{s.thought}</p>}
                          {s.input && Object.keys(s.input).length > 0 && (
                            <pre className="text-[11px] bg-foreground/5 rounded p-2 overflow-x-auto mb-1">{JSON.stringify(s.input, null, 0)}</pre>
                          )}
                          {s.observation && <p className="text-xs whitespace-pre-wrap text-foreground/80">{s.observation}</p>}
                          {s.error && <p className="text-xs text-red-600">{s.error}</p>}
                          {s.artifact && <a href={s.artifact.url} download className="text-xs text-foreground hover:underline inline-flex items-center gap-1 mt-1"><Download className="w-3 h-3" />{s.artifact.name}</a>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

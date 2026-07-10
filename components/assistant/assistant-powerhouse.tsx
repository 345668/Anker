"use client"

/**
 * AssistantPowerhouse — /dashboard/assistant, the ONE Anker AI.
 *
 * Merges the two previous assistants (the tool-running agent and the plain
 * advisor chat) into a single multi-turn surface:
 *
 *   - Conversation thread with memory: each turn sends a condensed
 *     transcript so follow-up questions work ("now draft outreach for the
 *     top three").
 *   - The full merged tool belt (web research, LP matchmaking, documents/
 *     decks/media, FO batch pipelines, AND the platform itself: CRM, deal
 *     pipeline, LinkedIn intro paths, outreach inbox, fund performance).
 *   - Attachments (PDF / images / text / audio) preprocessed server-side.
 *   - Per-turn reasoning + tool-call accordion and artifact chips.
 *   - Tool-belt drawer so users can see what the assistant can do.
 *
 * API contract unchanged: POST /api/assistant (JSON or multipart).
 */

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import {
  Send, Loader2, Wrench, FileSpreadsheet, FileText, Download, Paperclip,
  Image as ImageIcon, X, ChevronDown, ChevronRight, Sparkles, Cpu,
  Globe, Users, Waypoints, Inbox, TrendingUp, Presentation, Database,
} from "lucide-react"

interface Artifact { name: string; url: string; kind: string }
interface Step { thought?: string; tool?: string; input?: any; observation?: string; artifact?: Artifact; error?: string }
interface Turn {
  role: "user" | "assistant"
  text: string
  steps?: Step[]
  artifacts?: Artifact[]
  files?: string[]
  error?: boolean
}

const EXAMPLES = [
  "How healthy is my CRM? Then create follow-up tasks for anything stale.",
  "What's in my deal pipeline right now, and which deals are stuck?",
  "Who can introduce me to Anne Wojcicki? Check my LinkedIn network.",
  "Build an LP shortlist for our $20M fund — climate + AI family offices — and produce the XLSX.",
  "Research Gullspång Invest, then draft a one-page intro memo as a Word doc.",
  "What's due in my outreach inbox? Summarize the unhandled replies.",
  "Create a 10-slide pitch deck for our $5M seed round in climate-tech AI, export PPTX + PDF.",
  "Attach a pitch deck PDF and critique it as a Series A investor.",
]

const TOOL_GROUPS: Array<{ label: string; icon: any; tools: string[] }> = [
  { label: "Platform", icon: Waypoints, tools: ["crm_overview", "crm_search", "crm_update_stage", "crm_add_task", "deal_pipeline", "network_intro_paths", "outreach_inbox", "fund_performance"] },
  { label: "Research", icon: Globe, tools: ["web_search", "web_crawl", "build_investor_profile"] },
  { label: "Investor data", icon: Database, tools: ["query_investors", "matchmake_lps", "score_investors", "enrich_firms", "draft_outreach_batch"] },
  { label: "Documents & decks", icon: Presentation, tools: ["generate_spreadsheet", "generate_document", "create_pitch_deck", "improve_pitch_deck"] },
  { label: "Media & language", icon: ImageIcon, tools: ["analyze_image", "ocr_image", "generate_image", "translate_text"] },
  { label: "FO batch pipelines", icon: FileSpreadsheet, tools: ["enrich_db_from_xlsx", "db_gap_analysis", "generate_event_outreach_drafts", "apply_template_to_outreach_drafts", "enrich_xlsx_with_llm"] },
]

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Claude", gemini: "Gemini", openai: "OpenAI",
  mistral: "Mistral", qwen: "Qwen", ollama: "Ollama (local)", none: "None",
}

const fetcher = (u: string) => fetch(u).then((r) => r.json())

const artifactIcon = (kind: string) =>
  kind === "xlsx" || kind === "csv" ? FileSpreadsheet :
  kind === "pptx" ? Presentation :
  kind === "png" ? ImageIcon : FileText

/** Condensed transcript so the single-task agent API behaves multi-turn. */
function transcriptPrefix(turns: Turn[]): string {
  const recent = turns.slice(-8)
  if (!recent.length) return ""
  const lines = recent.map((t) =>
    `${t.role === "user" ? "USER" : "ASSISTANT"}: ${t.text.replace(/\s+/g, " ").slice(0, 500)}`)
  return `CONVERSATION SO FAR (context — the new request may refer back to it):\n${lines.join("\n")}\n\nNEW REQUEST: `
}

export function AssistantPowerhouse() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [task, setTask] = useState("")
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [toolsOpen, setToolsOpen] = useState(false)
  const [openStepIdx, setOpenStepIdx] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const { data: aiConfig } = useSWR<{ providerActive: string; providerInfo?: { model?: string } }>(
    "/api/admin/ai-config", fetcher, { revalidateOnFocus: false, dedupingInterval: 60000 })

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [turns, busy])

  function addFiles(picked: FileList | File[] | null) {
    if (!picked) return
    setFiles((prev) => {
      const seen = new Set(prev.map((p) => p.name + ":" + p.size))
      const merged = [...prev]
      for (const f of Array.from(picked)) {
        if (f.size === 0 || f.size > 25 * 1024 * 1024) continue
        const key = f.name + ":" + f.size
        if (!seen.has(key)) { merged.push(f); seen.add(key) }
      }
      let total = 0
      return merged.filter((f) => { total += f.size; return total <= 75 * 1024 * 1024 })
    })
  }

  async function submit(text?: string) {
    const prompt = (text ?? task).trim()
    if (!prompt || busy) return
    setBusy(true)
    setTask("")
    const attached = files
    setFiles([])
    setTurns((prev) => [...prev, { role: "user", text: prompt, files: attached.map((f) => f.name) }])

    const fullTask = transcriptPrefix(turns) + prompt
    try {
      let res: Response
      if (attached.length) {
        const fd = new FormData()
        fd.set("task", fullTask)
        for (const f of attached) fd.append("files", f)
        res = await fetch("/api/assistant", { method: "POST", body: fd, credentials: "include" })
      } else {
        res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ task: fullTask }),
        })
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Assistant failed (${res.status})`)
      setTurns((prev) => [...prev, {
        role: "assistant",
        text: data.answer ?? "(no answer)",
        steps: data.steps ?? [],
        artifacts: data.artifacts ?? [],
      }])
    } catch (e: any) {
      setTurns((prev) => [...prev, { role: "assistant", text: e?.message ?? "Something went wrong.", error: true }])
    } finally {
      setBusy(false)
    }
  }

  const provider = aiConfig?.providerActive ?? null

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="px-6 lg:px-10 pt-6 pb-4 border-b border-foreground/10">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-1.5">
              <span className="w-8 h-px bg-foreground/30" />
              AI · research → platform tools → deliverables
            </span>
            <h1 className="text-3xl lg:text-4xl font-display tracking-tight leading-[0.95]">Assistant.</h1>
          </div>
          <div className="flex items-center gap-3">
            {provider && (
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <Cpu className="w-3.5 h-3.5" />
                {PROVIDER_NAMES[provider] ?? provider}{aiConfig?.providerInfo?.model ? ` · ${aiConfig.providerInfo.model}` : ""}
              </span>
            )}
            <button onClick={() => setToolsOpen((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-full h-9 px-4 border text-sm hover:bg-foreground/5 ${toolsOpen ? "border-foreground/50" : "border-foreground/15"}`}>
              <Wrench className="w-4 h-4" />
              Tool belt
            </button>
            {turns.length > 0 && (
              <button onClick={() => setTurns([])}
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
                New conversation
              </button>
            )}
          </div>
        </div>

        {toolsOpen && (
          <div className="mt-4 grid md:grid-cols-3 gap-3">
            {TOOL_GROUPS.map((g) => (
              <div key={g.label} className="border border-foreground/10 rounded-lg p-3">
                <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-2">
                  <g.icon className="w-3.5 h-3.5" /> {g.label}
                </div>
                <div className="flex flex-wrap gap-1">
                  {g.tools.map((t) => (
                    <span key={t} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-foreground/5">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Thread */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 lg:px-10 py-6">
        <div className="max-w-[840px] mx-auto space-y-6">
          {!turns.length && (
            <div className="pt-8">
              <p className="text-sm text-muted-foreground mb-4">
                One assistant, every tool — it reads your CRM, deal pipeline, LinkedIn network and
                outreach inbox, researches the web, and ships spreadsheets, memos and decks. Try:
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => submit(ex)}
                    className="text-left text-sm p-3 rounded-lg border border-foreground/10 hover:border-foreground/30 hover:bg-foreground/[0.02] transition-colors">
                    <Sparkles className="w-3.5 h-3.5 inline mr-1.5 text-muted-foreground" />
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => (
            <div key={i} className={t.role === "user" ? "flex justify-end" : ""}>
              {t.role === "user" ? (
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-foreground text-background px-4 py-2.5 text-sm whitespace-pre-wrap">
                  {t.text}
                  {!!t.files?.length && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {t.files.map((f) => (
                        <span key={f} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-background/15">{f}</span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-w-[95%] space-y-2">
                  {!!t.steps?.length && (
                    <div className="border border-foreground/10 rounded-lg overflow-hidden">
                      <button onClick={() => setOpenStepIdx(openStepIdx === i ? null : i)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-foreground/[0.02]">
                        {openStepIdx === i ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        <Wrench className="w-3.5 h-3.5" />
                        {t.steps.filter((s) => s.tool).length} tool call{t.steps.filter((s) => s.tool).length === 1 ? "" : "s"}
                        <span className="ml-auto font-mono text-[10px]">
                          {Array.from(new Set(t.steps.map((s) => s.tool).filter(Boolean))).slice(0, 4).join(" · ")}
                        </span>
                      </button>
                      {openStepIdx === i && (
                        <div className="border-t border-foreground/10 divide-y divide-foreground/5">
                          {t.steps.map((s, j) => (
                            <div key={j} className="px-3 py-2 text-xs space-y-1">
                              {s.thought && <div className="text-muted-foreground italic">{s.thought}</div>}
                              {s.tool && (
                                <div className="font-mono text-[11px]">
                                  <span className="px-1.5 py-0.5 rounded bg-foreground/5">{s.tool}</span>
                                  {s.input ? <span className="text-muted-foreground"> {JSON.stringify(s.input).slice(0, 160)}</span> : null}
                                </div>
                              )}
                              {s.observation && <div className="text-muted-foreground whitespace-pre-wrap line-clamp-4">{s.observation}</div>}
                              {s.error && <div className="text-destructive">{s.error}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`rounded-2xl rounded-bl-sm px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                    t.error ? "border border-destructive/30 bg-destructive/5 text-destructive" : "border border-foreground/10"}`}>
                    {t.text}
                  </div>

                  {!!t.artifacts?.length && (
                    <div className="flex flex-wrap gap-2">
                      {t.artifacts.map((a) => {
                        const Icon = artifactIcon(a.kind)
                        return (
                          <a key={a.url} href={a.url} download
                            className="inline-flex items-center gap-2 h-9 px-3 rounded-full border border-foreground/15 hover:bg-foreground/5 text-sm">
                            <Icon className="w-4 h-4" />
                            <span className="max-w-[220px] truncate">{a.name}</span>
                            <Download className="w-3.5 h-3.5 text-muted-foreground" />
                          </a>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Working — running tools as needed…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-foreground/10 px-6 lg:px-10 py-4">
        <div className="max-w-[840px] mx-auto">
          {!!files.length && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={f.name + i} className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2 py-1 rounded-full bg-foreground/5">
                  <Paperclip className="w-3 h-3" />
                  <span className="max-w-[180px] truncate">{f.name}</span>
                  <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" multiple className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.mp3,.m4a,.wav"
              onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = "" }} />
            <button onClick={() => fileRef.current?.click()} aria-label="Attach files"
              className="h-11 w-11 shrink-0 rounded-full border border-foreground/15 flex items-center justify-center text-muted-foreground hover:bg-foreground/5">
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit() } }}
              rows={Math.min(5, Math.max(1, task.split("\n").length))}
              placeholder='Ask anything — "check my pipeline", "shortlist climate LPs and make the XLSX", "who can intro me to…"'
              className="flex-1 resize-none p-3 rounded-xl border border-input bg-background text-sm leading-relaxed"
            />
            <button onClick={() => submit()} disabled={busy || !task.trim()} aria-label="Send"
              className="h-11 w-11 shrink-0 rounded-full bg-foreground text-background flex items-center justify-center disabled:opacity-40 hover:bg-foreground/90">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Enter to send · Shift+Enter for a new line · attach PDFs, images, text or audio (25&nbsp;MB each)
          </p>
        </div>
      </div>
    </div>
  )
}

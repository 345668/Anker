"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Sparkles, Send, Loader2, Wrench, FileSpreadsheet, FileText, Globe, Search, Target, Database, ChevronDown, ChevronRight, Download, Paperclip, Image as ImageIcon, X, FileUp, Presentation, FileType2, Cpu } from "lucide-react"

interface Artifact { name: string; url: string; kind: string }
interface Step { thought?: string; tool?: string; input?: any; observation?: string; artifact?: Artifact; error?: string }
interface ProcessedFile { name: string; kind: "pdf" | "image" | "text" | "audio" | "other"; sizeBytes: number; notes?: string }
interface Result { answer: string; steps: Step[]; artifacts: Artifact[]; provider: string; filesProcessed?: ProcessedFile[] }

const EXAMPLES = [
  "Build an LP shortlist for our $20M emerging-manager fund-of-funds — lesser-known family offices, right-sized, in climate and AI. Produce the XLSX.",
  "Research Gullspång Invest, then draft a one-page intro memo as a Word doc.",
  "Find lesser-known family offices in our database that back fund managers, and rank them.",
  "Web-search the latest on Decile Group, crawl their site, and summarize their thesis.",
  "Attach a pitch deck PDF and ask: extract the team slide, market sizing, and traction — then critique them as a Series A investor.",
  "Attach a screenshot of an investor's portfolio page and ask: OCR the portfolio company list and look them up in our DB.",
  "Generate a hero image for our pitch deck cover: 'minimal cinematic photo of a Utah mountain at sunrise, Anker logo overlay, 16:9'.",
  "Translate the attached Japanese intro email into English while keeping the formal tone.",
  "Create a 10-slide pitch deck for our $5M seed round in climate-tech AI. Generate cover/section images automatically. Export as both PowerPoint and PDF.",
  "Attach my current pitch deck PDF and improve it: tighten the narrative, fix the market sizing, regenerate the hero image, and ship a new PowerPoint + PDF.",
]

const toolIcon: Record<string, any> = {
  web_search: Search, web_crawl: Globe, matchmake_lps: Target,
  build_investor_profile: Sparkles, query_investors: Database,
  generate_spreadsheet: FileSpreadsheet, generate_document: FileText,
  analyze_image: ImageIcon, ocr_image: ImageIcon, generate_image: ImageIcon,
  translate_text: Sparkles,
  create_pitch_deck: Presentation, improve_pitch_deck: Presentation,
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Claude", gemini: "Gemini", openai: "OpenAI", 
  mistral: "Mistral", qwen: "Qwen", ollama: "Ollama (Local)", none: "None"
}

export function AssistantContent() {
  const [task, setTask] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [openSteps, setOpenSteps] = useState(true)
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  
  // Fetch provider info to display active model
  const { data: aiConfig } = useSWR<{ providerActive: string; providerInfo?: { model?: string } }>("/api/admin/ai-config", fetcher, { 
    revalidateOnFocus: false, 
    dedupingInterval: 60000 
  })

  function addFiles(picked: FileList | File[] | null) {
    if (!picked) return
    const next = Array.from(picked).filter((f) => f.size > 0)
    setFiles((prev) => {
      const seen = new Set(prev.map((p) => p.name + ":" + p.size))
      const merged = [...prev]
      for (const f of next) {
        const key = f.name + ":" + f.size
        if (!seen.has(key)) { merged.push(f); seen.add(key) }
      }
      // 25 MB per file, 75 MB total — matches API caps
      let total = 0
      const filtered: File[] = []
      for (const f of merged) {
        if (f.size > 25 * 1024 * 1024) continue
        total += f.size
        if (total > 75 * 1024 * 1024) break
        filtered.push(f)
      }
      return filtered
    })
  }
  function removeFile(idx: number) { setFiles((prev) => prev.filter((_, i) => i !== idx)) }
  function fileIcon(f: File) {
    if (f.type.startsWith("image/")) return ImageIcon
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) return FileText
    if (/\.(xlsx|xls|csv)$/i.test(f.name)) return FileSpreadsheet
    return FileUp
  }

  async function run(prompt?: string) {
    const t = (prompt ?? task).trim()
    if (!t || busy) return
    setBusy(true); setErr(null); setResult(null)
    if (prompt) setTask(prompt)
    try {
      let res: Response
      if (files.length) {
        // multipart — attach the files alongside the task
        const fd = new FormData()
        fd.append("task", t)
        for (const f of files) fd.append("files", f)
        res = await fetch("/api/assistant", { method: "POST", body: fd })
      } else {
        res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: t }),
        })
      }
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
              Research the web, crawl sites, matchmake LPs, analyze attached PDFs/images, OCR scans, generate images, build & improve pitch decks (.pptx + .pdf), translate text, and export XLSX / Word deliverables — autonomously.
            </p>
          </div>
          {aiConfig?.providerActive && aiConfig.providerActive !== "none" && (
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground bg-foreground/5 px-3 py-1.5 rounded-full">
              <Cpu className="w-3.5 h-3.5" />
              <span>{PROVIDER_NAMES[aiConfig.providerActive] || aiConfig.providerActive}</span>
              {aiConfig.providerInfo?.model && <span className="font-mono text-[10px] opacity-70">{aiConfig.providerInfo.model}</span>}
            </div>
          )}
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
          {files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {files.map((f, i) => {
                const Icon = fileIcon(f)
                return (
                  <div key={f.name + i} className="inline-flex items-center gap-2 px-2 py-1 border border-foreground/15 rounded-md text-xs bg-foreground/[0.02]" title={`${f.type || "file"} · ${Math.round(f.size/1024)} KB`}>
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-mono truncate max-w-[180px]">{f.name}</span>
                    <span className="text-[10px] text-muted-foreground">{Math.round(f.size/1024)} KB</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-rose-600"><X className="w-3 h-3" /></button>
                  </div>
                )
              })}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept="application/pdf,image/*,text/plain,text/markdown,text/csv,application/json"
            onChange={(e) => { addFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = "" }}
          />
          <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-foreground/15 rounded-md text-xs hover:bg-foreground/5"
                title="Attach PDFs, images (PNG/JPG), or text files — read + analyzed via Qwen-VL / Anthropic"
              >
                <Paperclip className="w-3.5 h-3.5" /> Attach files
              </button>
              <span className="text-[11px] text-muted-foreground">⌘/Ctrl + Enter to run · 25 MB/file, 75 MB total</span>
            </div>
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

            {/* Files processed (uploads) */}
            {result.filesProcessed && result.filesProcessed.length > 0 && (
              <div className="border border-foreground/10 rounded-xl p-5">
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3">Uploaded files</p>
                <div className="space-y-1.5">
                  {result.filesProcessed.map((f) => (
                    <div key={f.name} className="flex items-center gap-2 text-sm">
                      {f.kind === "image" ? <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        : f.kind === "pdf" ? <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        : <FileUp className="w-3.5 h-3.5 text-muted-foreground" />}
                      <span className="font-mono">{f.name}</span>
                      <span className="text-[11px] text-muted-foreground">({f.kind}, {Math.round(f.sizeBytes/1024)} KB{f.notes ? ` — ${f.notes}` : ""})</span>
                    </div>
                  ))}
                </div>
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
                      {a.kind === "xlsx" ? <FileSpreadsheet className="w-4 h-4" /> : a.kind === "pptx" ? <Presentation className="w-4 h-4" /> : a.kind === "pdf" ? <FileType2 className="w-4 h-4" /> : a.kind === "png" ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
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

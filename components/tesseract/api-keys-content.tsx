"use client"

import { useEffect, useState } from "react"
import { KeyRound, Loader2, CheckCircle2, XCircle, Sparkles, Server, ShieldCheck, FlaskConical } from "lucide-react"

type KeyStatus = { set: boolean; hint?: string | null }
interface Loaded {
  providerActive: string
  config: { providerOverride: string | null; localEnabled: boolean; geminiModel: string | null; anthropicModel: string | null }
  keys: { gemini: KeyStatus; anthropic: KeyStatus }
}
interface TestResult { useCase: string; ok: boolean; ms: number; sample: string; error: string | null }

const PROVIDER_OPTIONS = [
  { value: "auto", label: "Auto (Gemini → Claude → local)" },
  { value: "gemini", label: "Gemini (force)" },
  { value: "anthropic", label: "Claude (force)" },
  { value: "ollama", label: "Local Ollama (force)" },
  { value: "none", label: "Off (disable AI)" },
]

export function ApiKeysContent({ isAdmin }: { isAdmin: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [geminiKey, setGeminiKey] = useState("")
  const [claudeKey, setClaudeKey] = useState("")
  const [provider, setProvider] = useState("auto")
  const [geminiModel, setGeminiModel] = useState("")
  const [anthropicModel, setAnthropicModel] = useState("")
  const [localEnabled, setLocalEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [test, setTest] = useState<{ provider: string; model: string | null; passed: number; total: number; allOk: boolean; message?: string; results: TestResult[] } | null>(null)

  async function load() {
    try {
      const r = await fetch("/api/admin/ai-config")
      if (!r.ok) { setMsg({ ok: false, text: r.status === 403 ? "Admin access required." : "Failed to load config." }); return }
      const d = await r.json() as Loaded
      setLoaded(d)
      setProvider(d.config.providerOverride ?? "auto")
      setLocalEnabled(!!d.config.localEnabled)
      setGeminiModel(d.config.geminiModel ?? "")
      setAnthropicModel(d.config.anthropicModel ?? "")
    } catch { setMsg({ ok: false, text: "Network error loading config." }) }
  }
  useEffect(() => { load() }, [])

  async function save() {
    setBusy(true); setMsg(null)
    const body: any = {
      providerOverride: provider === "auto" ? null : provider,
      localEnabled,
      geminiModel: geminiModel.trim() || "",
      anthropicModel: anthropicModel.trim() || "",
    }
    if (geminiKey.trim()) body.geminiApiKey = geminiKey.trim()
    if (claudeKey.trim()) body.anthropicApiKey = claudeKey.trim()
    try {
      const r = await fetch("/api/admin/ai-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) { setMsg({ ok: false, text: d?.error || "Save failed." }); return }
      setGeminiKey(""); setClaudeKey("")
      setMsg({ ok: true, text: "Saved. Provider reset — changes apply across the app immediately." })
      load()
    } catch { setMsg({ ok: false, text: "Network error saving." }) } finally { setBusy(false) }
  }

  async function clearKey(which: "gemini" | "anthropic") {
    setBusy(true); setMsg(null)
    const body: any = which === "gemini" ? { geminiApiKey: "" } : { anthropicApiKey: "" }
    try {
      const r = await fetch("/api/admin/ai-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!r.ok) { const d = await r.json(); setMsg({ ok: false, text: d?.error || "Failed." }); return }
      setMsg({ ok: true, text: `${which === "gemini" ? "Gemini" : "Claude"} key cleared.` }); load()
    } finally { setBusy(false) }
  }

  async function runTest() {
    setTesting(true); setTest(null); setMsg(null)
    try {
      const r = await fetch("/api/admin/ai-test", { method: "POST" })
      const d = await r.json()
      if (!r.ok) { setMsg({ ok: false, text: d?.error || "Test failed." }); return }
      setTest(d)
    } catch { setMsg({ ok: false, text: "Network error during test." }) } finally { setTesting(false) }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-foreground/10 px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center"><KeyRound className="w-5 h-5" /></div>
          <div>
            <h1 className="font-display text-2xl">API Keys & AI Providers</h1>
            <p className="text-sm text-muted-foreground">Set Gemini / Claude keys used across every AI feature. Local models stay off unless enabled.</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-8 py-6 space-y-6">
        {!isAdmin && (
          <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded-lg px-4 py-3 text-sm">
            These controls require an admin account. You can view this page, but saving will be rejected.
          </div>
        )}

        {/* Active provider */}
        <div className="border border-foreground/10 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Active provider: <span className="font-mono font-medium">{loaded?.providerActive ?? "…"}</span>
          </div>
          <span className="text-xs text-muted-foreground">used by newsroom · matchmaking · find investors · agents · assistant · deep research · URL check · enrichment</span>
        </div>

        {/* Keys */}
        <div className="border border-foreground/10 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 font-medium text-sm"><Sparkles className="w-4 h-4" /> Cloud API keys</div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Google Gemini API key</label>
            <div className="flex items-center gap-2">
              <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)}
                placeholder={loaded?.keys.gemini.set ? `saved (${loaded.keys.gemini.hint})` : "AIza…"}
                className="flex-1 border border-foreground/15 rounded-lg px-3 py-2 text-sm bg-transparent outline-none" />
              {loaded?.keys.gemini.set && <button onClick={() => clearKey("gemini")} disabled={busy} className="text-xs text-red-600 hover:underline">Clear</button>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Anthropic (Claude) API key</label>
            <div className="flex items-center gap-2">
              <input type="password" value={claudeKey} onChange={(e) => setClaudeKey(e.target.value)}
                placeholder={loaded?.keys.anthropic.set ? `saved (${loaded.keys.anthropic.hint})` : "sk-ant-…"}
                className="flex-1 border border-foreground/15 rounded-lg px-3 py-2 text-sm bg-transparent outline-none" />
              {loaded?.keys.anthropic.set && <button onClick={() => clearKey("anthropic")} disabled={busy} className="text-xs text-red-600 hover:underline">Clear</button>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Gemini model (optional)</label>
              <input value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)} placeholder="gemini-2.0-flash"
                className="w-full border border-foreground/15 rounded-lg px-3 py-2 text-sm bg-transparent outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Claude model (optional)</label>
              <input value={anthropicModel} onChange={(e) => setAnthropicModel(e.target.value)} placeholder="claude-haiku-4-5-20251001"
                className="w-full border border-foreground/15 rounded-lg px-3 py-2 text-sm bg-transparent outline-none" />
            </div>
          </div>
        </div>

        {/* Provider preference + local toggle */}
        <div className="border border-foreground/10 rounded-xl p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Default provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}
              className="w-full border border-foreground/15 rounded-lg px-3 py-2 text-sm bg-background outline-none">
              {PROVIDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="flex items-center gap-2 text-sm"><Server className="w-4 h-4" /> Enable local models (Ollama)
              <span className="text-xs text-muted-foreground">— off by default; also toggleable in Data Ops</span></span>
            <input type="checkbox" checked={localEnabled} onChange={(e) => setLocalEnabled(e.target.checked)} className="w-4 h-4" />
          </label>
        </div>

        {msg && (
          <div className={`rounded-lg px-4 py-3 text-sm border ${msg.ok ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-700"}`}>{msg.text}</div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 bg-foreground text-background px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save
          </button>
          <button onClick={runTest} disabled={testing} className="inline-flex items-center gap-2 border border-foreground/15 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />} Test across all use cases
          </button>
        </div>

        {/* Test results */}
        {test && (
          <div className="border border-foreground/10 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Self-test — {test.provider}{test.model ? ` · ${test.model}` : ""}</span>
              {test.results.length > 0 && <span className={`text-sm font-mono ${test.allOk ? "text-emerald-600" : "text-amber-600"}`}>{test.passed}/{test.total} passed</span>}
            </div>
            {test.message && <p className="text-sm text-amber-700">{test.message}</p>}
            <div className="space-y-1.5">
              {test.results.map((r) => (
                <div key={r.useCase} className="flex items-start gap-2 text-sm">
                  {r.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                  <span className="font-medium w-44 shrink-0">{r.useCase}</span>
                  <span className="text-muted-foreground text-xs">{r.ms}ms — {r.ok ? r.sample : (r.error || "failed")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

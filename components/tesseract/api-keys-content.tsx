"use client"

import { useEffect, useState } from "react"
import { KeyRound, Loader2, CheckCircle2, XCircle, Sparkles, Server, ShieldCheck, FlaskConical } from "lucide-react"

type KeyStatus = { set: boolean; hint?: string | null }
interface Loaded {
  providerActive: string
  config: { providerOverride: string | null; providerStrict?: boolean; localEnabled: boolean; geminiModel: string | null; anthropicModel: string | null; openaiModel: string | null; mistralModel: string | null; qwenModel: string | null; qwenWorkspaceId: string | null }
  keys: { gemini: KeyStatus; anthropic: KeyStatus; openai: KeyStatus; mistral: KeyStatus; qwen: KeyStatus }
}
interface TestResult { useCase: string; ok: boolean; ms: number; sample: string; error: string | null; answeredBy?: string | null }

const PROVIDER_OPTIONS = [
  { value: "auto", label: "Auto (Claude → Gemini → OpenAI → Mistral → local)" },
  { value: "anthropic", label: "Claude (force)" },
  { value: "gemini", label: "Gemini (force)" },
  { value: "openai", label: "OpenAI (force)" },
  { value: "mistral", label: "Mistral (force)" },
  { value: "qwen", label: "Qwen / DashScope (force)" },
  { value: "ollama", label: "Local Ollama (force)" },
  { value: "none", label: "Off (disable AI)" },
]

export function ApiKeysContent({ isAdmin }: { isAdmin: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [geminiKey, setGeminiKey] = useState("")
  const [claudeKey, setClaudeKey] = useState("")
  const [openaiKey, setOpenaiKey] = useState("")
  const [mistralKey, setMistralKey] = useState("")
  const [qwenKey, setQwenKey] = useState("")
  const [qwenWorkspace, setQwenWorkspace] = useState("")
  const [provider, setProvider] = useState("auto")
  const [geminiModel, setGeminiModel] = useState("")
  const [anthropicModel, setAnthropicModel] = useState("")
  const [openaiModel, setOpenaiModel] = useState("")
  const [mistralModel, setMistralModel] = useState("")
  const [qwenModel, setQwenModel] = useState("")
  const [localEnabled, setLocalEnabled] = useState(false)
  const [providerStrict, setProviderStrict] = useState(false)
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
      setProviderStrict(!!d.config.providerStrict)
      setLocalEnabled(!!d.config.localEnabled)
      setGeminiModel(d.config.geminiModel ?? "")
      setAnthropicModel(d.config.anthropicModel ?? "")
      setOpenaiModel(d.config.openaiModel ?? "")
      setMistralModel(d.config.mistralModel ?? "")
      setQwenModel(d.config.qwenModel ?? "")
      setQwenWorkspace(d.config.qwenWorkspaceId ?? "")
    } catch { setMsg({ ok: false, text: "Network error loading config." }) }
  }
  useEffect(() => { load() }, [])

  async function save() {
    setBusy(true); setMsg(null)
    const body: any = {
      providerOverride: provider === "auto" ? null : provider,
      providerStrict,
      localEnabled,
      geminiModel: geminiModel.trim() || "",
      anthropicModel: anthropicModel.trim() || "",
      openaiModel: openaiModel.trim() || "",
      mistralModel: mistralModel.trim() || "",
      qwenModel: qwenModel.trim() || "",
      qwenWorkspaceId: qwenWorkspace.trim() || "",
    }
    if (geminiKey.trim()) body.geminiApiKey = geminiKey.trim()
    if (claudeKey.trim()) body.anthropicApiKey = claudeKey.trim()
    if (openaiKey.trim()) body.openaiApiKey = openaiKey.trim()
    if (mistralKey.trim()) body.mistralApiKey = mistralKey.trim()
    if (qwenKey.trim()) body.qwenApiKey = qwenKey.trim()
    try {
      const r = await fetch("/api/admin/ai-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) { setMsg({ ok: false, text: d?.error || "Save failed." }); return }
      setGeminiKey(""); setClaudeKey(""); setOpenaiKey(""); setMistralKey(""); setQwenKey("")
      setMsg({ ok: true, text: "Saved. Provider reset — changes apply across the app immediately." })
      load()
    } catch { setMsg({ ok: false, text: "Network error saving." }) } finally { setBusy(false) }
  }

  async function clearKey(which: "gemini" | "anthropic" | "openai" | "mistral" | "qwen") {
    setBusy(true); setMsg(null)
    const field = { gemini: "geminiApiKey", anthropic: "anthropicApiKey", openai: "openaiApiKey", mistral: "mistralApiKey", qwen: "qwenApiKey" }[which]
    const label = { gemini: "Gemini", anthropic: "Claude", openai: "OpenAI", mistral: "Mistral", qwen: "Qwen" }[which]
    try {
      const r = await fetch("/api/admin/ai-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: "" }) })
      if (!r.ok) { const d = await r.json(); setMsg({ ok: false, text: d?.error || "Failed." }); return }
      setMsg({ ok: true, text: `${label} key cleared.` }); load()
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
            <p className="text-sm text-muted-foreground">Set Claude / Gemini / OpenAI / Mistral / Qwen keys used across every AI feature. Auto fails over in that order; local models stay off unless enabled.</p>
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

          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">OpenAI API key</label>
            <div className="flex items-center gap-2">
              <input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder={loaded?.keys.openai.set ? `saved (${loaded.keys.openai.hint})` : "sk-…"}
                className="flex-1 border border-foreground/15 rounded-lg px-3 py-2 text-sm bg-transparent outline-none" />
              {loaded?.keys.openai.set && <button onClick={() => clearKey("openai")} disabled={busy} className="text-xs text-red-600 hover:underline">Clear</button>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Mistral API key</label>
            <div className="flex items-center gap-2">
              <input type="password" value={mistralKey} onChange={(e) => setMistralKey(e.target.value)}
                placeholder={loaded?.keys.mistral.set ? `saved (${loaded.keys.mistral.hint})` : "…"}
                className="flex-1 border border-foreground/15 rounded-lg px-3 py-2 text-sm bg-transparent outline-none" />
              {loaded?.keys.mistral.set && <button onClick={() => clearKey("mistral")} disabled={busy} className="text-xs text-red-600 hover:underline">Clear</button>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Qwen / DashScope API key (Alibaba)</label>
            <div className="flex items-center gap-2">
              <input type="password" value={qwenKey} onChange={(e) => setQwenKey(e.target.value)}
                placeholder={loaded?.keys.qwen?.set ? `saved (${loaded.keys.qwen.hint})` : "sk-…"}
                className="flex-1 border border-foreground/15 rounded-lg px-3 py-2 text-sm bg-transparent outline-none" />
              {loaded?.keys.qwen?.set && <button onClick={() => clearKey("qwen")} disabled={busy} className="text-xs text-red-600 hover:underline">Clear</button>}
            </div>
            <p className="text-[10px] text-muted-foreground">
              DashScope console → API Keys.  Required for the qwen3.7-plus / qwen3.7-max / qwen3-vl-* / qwen-flash family.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Qwen workspace id (Alibaba)</label>
            <input value={qwenWorkspace} onChange={(e) => setQwenWorkspace(e.target.value)} placeholder="<workspace-id>"
              className="w-full border border-foreground/15 rounded-lg px-3 py-2 text-sm bg-transparent outline-none" />
            <p className="text-[10px] text-muted-foreground">
              Found in the DashScope dashboard URL (the subdomain before <code>.ap-southeast-1.maas.aliyuncs.com</code>).  Used to build the OpenAI-compatible base URL.
            </p>
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
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">OpenAI model (optional)</label>
              <input value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)} placeholder="gpt-4o-mini"
                className="w-full border border-foreground/15 rounded-lg px-3 py-2 text-sm bg-transparent outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Mistral model (optional)</label>
              <input value={mistralModel} onChange={(e) => setMistralModel(e.target.value)} placeholder="mistral-small-latest"
                className="w-full border border-foreground/15 rounded-lg px-3 py-2 text-sm bg-transparent outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Qwen model (optional)</label>
              <input value={qwenModel} onChange={(e) => setQwenModel(e.target.value)} placeholder="qwen-flash, qwen3-vl-plus, qwen3.7-plus, qwen3.7-max…"
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

          {/* Only meaningful when a specific provider is forced. */}
          {provider !== "auto" && (
            <label className="flex items-start justify-between gap-3 cursor-pointer mt-3 pt-3 border-t border-foreground/10">
              <span className="text-sm">
                Use this provider only (no failover)
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Off (recommended): the chosen provider runs first and the other
                  configured providers back it up if it errors or hits a quota.
                  On: requests fail rather than falling back — use for cost or
                  data-residency control.
                </span>
              </span>
              <input
                type="checkbox"
                checked={providerStrict}
                onChange={(e) => setProviderStrict(e.target.checked)}
                className="w-4 h-4 mt-0.5 shrink-0"
              />
            </label>
          )}
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
                  <span className="text-muted-foreground text-xs">
                    {r.ms}ms{r.ok && r.answeredBy && r.answeredBy !== test.provider ? ` · via ${r.answeredBy}` : ""} — {r.ok ? r.sample : (r.error || "failed")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

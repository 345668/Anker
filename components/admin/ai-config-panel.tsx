"use client"

import { useEffect, useState, useTransition } from "react"
import {
  Loader2, RefreshCw, AlertTriangle, CheckCircle2, Bot, ToggleLeft, ToggleRight,
} from "lucide-react"

type ProviderId = "anthropic" | "ollama" | "none"

interface TaskRow {
  task: string
  tier: "fast" | "balanced" | "deep"
  resolvedModel: string
  enabled: boolean
  override: string | null
  modelPulled: boolean
}

interface ConfigPayload {
  providerActive: ProviderId
  providerInfo: any
  pulledModels: string[]
  config: {
    enabled: Record<string, boolean>
    modelOverride: Record<string, string>
    providerOverride: ProviderId | null
  }
  tasks: TaskRow[]
}

const TIER_TONE: Record<string, string> = {
  fast:     "bg-emerald-100 text-emerald-700",
  balanced: "bg-amber-100 text-amber-700",
  deep:     "bg-violet-100 text-violet-700",
}

export function AiConfigPanel() {
  const [data, setData] = useState<ConfigPayload | null>(null)
  const [loading, startLoad] = useTransition()
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)

  function load() {
    setError(null)
    startLoad(async () => {
      try {
        const res = await fetch("/api/admin/ai-config", { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`)
        setData(json)
      } catch (e: any) { setError(e?.message ?? "Load failed") }
    })
  }
  useEffect(() => { load() }, [])

  async function patch(patch: any, busyId: string): Promise<void> {
    setSaving(busyId); setError(null)
    try {
      const res = await fetch("/api/admin/ai-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`)
      await new Promise((r) => setTimeout(r, 80))   // give the cache 80ms to settle
      load()
    } catch (e: any) { setError(e?.message ?? "Save failed") }
    finally { setSaving(null) }
  }

  async function reconnect() {
    setReconnecting(true); setError(null)
    try {
      await fetch("/api/admin/system", { method: "POST" })
      load()
    } catch (e: any) { setError(e?.message ?? "Reconnect failed") }
    finally { setReconnecting(false) }
  }

  function toggleTask(t: TaskRow) {
    void patch({ enabled: { [t.task]: !t.enabled } }, `enable:${t.task}`)
  }
  function setOverride(t: TaskRow, model: string) {
    void patch({ modelOverride: { [t.task]: model } }, `model:${t.task}`)
  }
  function clearOverride(t: TaskRow) {
    void patch({ clearTask: t.task }, `clear:${t.task}`)
  }
  function setProvider(p: ProviderId | "auto") {
    void patch({ providerOverride: p === "auto" ? null : p }, "provider")
  }

  const provider = data?.providerActive ?? "none"
  const providerForced = data?.config.providerOverride ?? null

  return (
    <div className="space-y-6">
      {/* Provider summary */}
      <div className="border border-foreground/10 rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-muted-foreground" />
            <span className="font-display text-base">Provider</span>
            <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${
              provider === "ollama" ? "bg-emerald-100 text-emerald-700"
              : provider === "anthropic" ? "bg-blue-100 text-blue-700"
              : "bg-rose-100 text-rose-700"
            }`}>
              {provider}
            </span>
            {providerForced && (
              <span className="text-[10px] font-mono text-amber-700 ml-1">forced via admin override</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reconnect}
              disabled={reconnecting}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
              title="Re-probe Ollama / Anthropic. Use after starting Ollama or rotating an API key."
            >
              {reconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Reconnect
            </button>
          </div>
        </div>
        <div className="text-[11px] font-mono text-muted-foreground space-y-0.5">
          {data?.providerInfo?.url && <div>url: {data.providerInfo.url}</div>}
          {data?.providerInfo?.model && <div>default model: {data.providerInfo.model}</div>}
          {data?.pulledModels && data.pulledModels.length > 0 && (
            <div>pulled: {data.pulledModels.join(", ")}</div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Force provider:</span>
          {(["auto", "ollama", "anthropic", "none"] as const).map((p) => {
            const active = (p === "auto" && !providerForced) || providerForced === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                disabled={saving === "provider"}
                className={`px-2.5 py-1 text-[11px] rounded-md border ${
                  active ? "bg-foreground text-background border-foreground"
                  : "border-foreground/15 hover:bg-foreground/5"
                } disabled:opacity-50`}
              >
                {p}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-md text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="text-rose-700 dark:text-rose-400">{error}</span>
        </div>
      )}

      {/* Tasks table */}
      <div className="border border-foreground/10 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-foreground/5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <span>Tasks ({data?.tasks?.length ?? 0})</span>
          <span className="text-[10px] opacity-70">on = call the model · off = heuristic fallback</span>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border border-foreground/15 hover:bg-foreground/10"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-foreground/[0.02]">
            <tr>
              <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Task</th>
              <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Tier</th>
              <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Model</th>
              <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Override</th>
              <th className="p-2 text-center font-mono uppercase tracking-wider text-muted-foreground">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {(data?.tasks ?? []).map((t) => (
              <tr key={t.task} className="border-t border-foreground/5 align-middle">
                <td className="p-2 font-mono">{t.task}</td>
                <td className="p-2">
                  <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${TIER_TONE[t.tier]}`}>
                    {t.tier}
                  </span>
                </td>
                <td className="p-2 font-mono">
                  {t.resolvedModel}
                  {!t.modelPulled && (
                    <span className="ml-2 text-[10px] text-amber-700 inline-flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> not pulled
                    </span>
                  )}
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-1">
                    <select
                      value={t.override ?? ""}
                      onChange={(e) => {
                        const v = e.target.value
                        if (!v) clearOverride(t)
                        else setOverride(t, v)
                      }}
                      disabled={saving === `model:${t.task}` || saving === `clear:${t.task}`}
                      className="h-7 px-2 text-[11px] border border-foreground/15 rounded-md bg-background"
                    >
                      <option value="">— tier default —</option>
                      {(data?.pulledModels ?? []).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="p-2 text-center">
                  <button
                    type="button"
                    onClick={() => toggleTask(t)}
                    disabled={saving === `enable:${t.task}`}
                    className="inline-flex items-center"
                    title={t.enabled ? "Disable — calls fall back to heuristic" : "Re-enable"}
                  >
                    {t.enabled ? (
                      <ToggleRight className="w-7 h-7 text-emerald-600" />
                    ) : (
                      <ToggleLeft className="w-7 h-7 text-foreground/40" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.pulledModels.length === 0 && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-amber-700 dark:text-amber-400 leading-relaxed">
            No local models pulled yet.  Start the Ollama daemon and pull at least one chat-instruct model:
            <pre className="mt-2 text-[11px] font-mono opacity-90">
ollama serve &amp;       # if not already running (logs to ~/.ollama)
ollama pull gemma2:2b
ollama pull qwen2.5:7b-instruct
ollama pull qwen2.5:14b-instruct
ollama pull nomic-embed-text
            </pre>
            Then click <span className="font-medium">Reconnect</span> above — no Anker restart needed.
          </div>
        </div>
      )}
    </div>
  )
}

"use client"

/**
 * AiStatusBadge — the unified "AI extraction" / "AI engine" status card
 * used on Find Investors and LP Matchmaking.
 *
 * Reads /api/ai/status (no secrets) and shows:
 *   - the active provider (Claude / Gemini / OpenAI / Mistral / local /
 *     "Heuristic fallback" when nothing is configured)
 *   - a "failover: X → Y" caption listing the remaining configured
 *     providers in the chain order
 *   - "configure" link to Settings → API Keys when no provider is set
 *
 * Includes an optional "Force provider" select (used per-run) that the
 * parent receives via onProviderChange + value.  Lifting state up keeps
 * the override scoped to a single run instead of persisting globally.
 */

import { useEffect, useState } from "react"
import { Sparkles, AlertTriangle, RefreshCw } from "lucide-react"

export type AiProvider =
  | "anthropic" | "gemini" | "openai" | "mistral" | "ollama" | "none"

export interface AiStatus {
  active: AiProvider
  chain: AiProvider[]
  labels: Record<string, string>
  configured: { anthropic: boolean; gemini: boolean; openai: boolean; mistral: boolean; ollama: boolean }
  model: string | null
  forcedOverride: AiProvider | null
}

interface Props {
  /** Optional caption shown under the section header (default: "AI extraction"). */
  title?: string
  /** When provided, renders a per-run "Force provider" selector next to the badge. */
  override?: AiProvider | "auto"
  onOverrideChange?: (v: AiProvider | "auto") => void
  className?: string
}

const PROVIDER_ORDER: AiProvider[] = ["anthropic", "gemini", "openai", "mistral", "ollama"]

export function AiStatusBadge({ title = "AI extraction", override, onOverrideChange, className = "" }: Props) {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch("/api/ai/status", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Status failed (${res.status})`)
      setStatus(data as AiStatus)
    } catch (e: any) {
      setErr(e?.message ?? "Status failed")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [])

  const active = status?.active ?? "none"
  const isAi = active !== "none"
  const activeLabel = status ? (status.labels[active] ?? active) : "—"
  // Failover chain after the active one.
  const restChain = status?.chain.filter((p) => p !== active) ?? []
  const restLabels = restChain.map((p) => status?.labels[p] ?? p).join(" → ")

  return (
    <div className={`px-5 py-4 border border-foreground/10 rounded-lg ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> {title}
          </div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className={`w-2 h-2 rounded-full ${isAi ? "bg-emerald-500" : "bg-amber-500"}`} />
            {loading && !status ? "Checking…" : `${activeLabel}${isAi ? " — ready" : ""}`}
            {status?.model && isAi && (
              <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[180px]" title={status.model}>
                {status.model}
              </span>
            )}
          </div>
          {restChain.length > 0 && (
            <div className="font-mono text-[10px] text-muted-foreground mt-1">
              failover: {restLabels}
            </div>
          )}
          {!isAi && (
            <div className="font-mono text-[10px] text-muted-foreground mt-1">
              <a href="/dashboard/settings/api-keys" className="underline hover:text-foreground">
                Set a provider key →
              </a>
            </div>
          )}
          {status?.forcedOverride && (
            <div className="font-mono text-[10px] text-amber-700 mt-1">
              admin override: {status.labels[status.forcedOverride] ?? status.forcedOverride}
            </div>
          )}
          {err && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-rose-600">
              <AlertTriangle className="w-3 h-3" /> {err}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          title="Refresh"
          className="text-muted-foreground hover:text-foreground p-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Per-run override selector */}
      {override !== undefined && onOverrideChange && (
        <div className="mt-3 pt-3 border-t border-foreground/10">
          <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Force provider for this run
          </label>
          <select
            value={override}
            onChange={(e) => onOverrideChange(e.target.value as AiProvider | "auto")}
            className="mt-1 w-full h-8 px-2 text-xs border border-foreground/15 rounded-md bg-background"
          >
            <option value="auto">Auto (use failover chain)</option>
            {PROVIDER_ORDER.map((p) => (
              <option
                key={p}
                value={p}
                disabled={status ? !status.configured[p as keyof typeof status.configured] : true}
              >
                {status?.labels[p] ?? p}
                {status && !status.configured[p as keyof typeof status.configured] ? " — not configured" : ""}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

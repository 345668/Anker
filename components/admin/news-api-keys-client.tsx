"use client"

/**
 * /dashboard/admin/newsroom/api-keys — manage news-provider API keys
 * inside the admin UI (no env-file edits required).
 *
 * Persists to system_settings.news_providers_v1 via /api/admin/news/api-keys.
 * Each row shows the current source (db / env / none) and lets the admin
 * paste a new value or clear it (clearing falls back to env-var if set).
 *
 * Keys aren't echoed back from the server — only a tail mask. Users who
 * forget what they pasted have to paste again.
 */

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  ArrowLeft, Loader2, AlertTriangle, CheckCircle2, Save, Trash2,
  KeyRound, Globe, Lock, Eye, EyeOff,
} from "lucide-react"

interface KeyStatus {
  name: string
  set: boolean
  source: "db" | "env" | "none"
  masked: string | null
}

const PROVIDER_META: Record<string, { label: string; help: string; docs: string }> = {
  ALPHA_VANTAGE_API_KEY: {
    label: "Alpha Vantage",
    help: "NEWS_SENTIMENT — global feed with topic filter + sentiment scores. Free: 25 req/day.",
    docs: "https://www.alphavantage.co/support/#api-key",
  },
  FINNHUB_API_KEY: {
    label: "Finnhub",
    help: "General + merger news + IPO calendar (30-day forward). Free: 60 req/min.",
    docs: "https://finnhub.io/dashboard",
  },
  MARKETAUX_API_KEY: {
    label: "Marketaux",
    help: "Country-filtered financial news with keyword search. ~200 articles/day free.",
    docs: "https://www.marketaux.com/account/dashboard",
  },
  NEWSAPI_KEY: {
    label: "NewsAPI.org",
    help: "/v2/everything + /v2/top-headlines with country routing. Free: 100 req/day, 24h delay.",
    docs: "https://newsapi.org/account",
  },
  FRED_API_KEY: {
    label: "FRED (St. Louis Fed)",
    help: "Macro release calendar (CPI, payrolls, GDP). Fires only on the macro topic. Free: 120 req/min.",
    docs: "https://fredaccount.stlouisfed.org/apikeys",
  },
  MASSIVE_API_KEY: {
    label: "Massive — API key",
    help: "Scaffold provider — pair with MASSIVE_API_URL. Confirm endpoint shape with provider.",
    docs: "",
  },
  MASSIVE_API_URL: {
    label: "Massive — endpoint URL",
    help: "Full URL to Massive's news endpoint, e.g. https://api.massive.com/v1/news",
    docs: "",
  },
}

export function NewsApiKeysClient() {
  const [rows, setRows] = useState<KeyStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [reveal, setReveal] = useState<Record<string, boolean>>({})

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/admin/news/api-keys")
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Load failed (${res.status})`)
      setRows(Array.isArray(data.keys) ? data.keys : [])
    } catch (e: any) { setError(e?.message ?? "Load failed") }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  async function saveOne(name: string, value: string) {
    setBusy(true); setError(null); setSuccess(null)
    try {
      const res = await fetch("/api/admin/news/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [name]: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`)
      setRows(Array.isArray(data.keys) ? data.keys : [])
      setDrafts((p) => { const n = { ...p }; delete n[name]; return n })
      setSuccess(value ? `${PROVIDER_META[name]?.label ?? name} saved.` : `${PROVIDER_META[name]?.label ?? name} cleared — env-var fallback in effect.`)
    } catch (e: any) { setError(e?.message ?? "Save failed") }
    finally { setBusy(false) }
  }

  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin/newsroom/sources"
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> News sources
        </Link>
        <h1 className="mt-3 font-display text-3xl md:text-4xl tracking-tight">News provider keys</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Configure provider API keys without editing <span className="font-mono">.env.local</span>.
          DB-stored keys take precedence over env-vars; clearing a key falls back to the env-var if one is set.
          Keys are never logged and only the last four characters are revealable to admins.
        </p>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs font-mono text-rose-600 border border-rose-500/30 bg-rose-500/5 rounded-md inline-flex items-center gap-2">
          <AlertTriangle className="w-3 h-3" /> {error}
        </div>
      )}
      {success && (
        <div className="px-3 py-2 text-xs font-mono text-emerald-700 border border-emerald-500/30 bg-emerald-500/5 rounded-md inline-flex items-center gap-2">
          <CheckCircle2 className="w-3 h-3" /> {success}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading key state…
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const meta = PROVIDER_META[r.name] ?? { label: r.name, help: "", docs: "" }
            const draft = drafts[r.name] ?? ""
            const isRevealed = !!reveal[r.name]
            return (
              <div key={r.name} className="border border-foreground/10 rounded-md p-4 bg-background">
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  <KeyRound className="w-4 h-4 text-foreground/60 shrink-0" />
                  <div className="font-medium">{meta.label}</div>
                  <SourceChip source={r.source} />
                  {r.masked && (
                    <span className="text-[10px] font-mono text-muted-foreground">{r.masked}</span>
                  )}
                  {meta.docs && (
                    <a href={meta.docs} target="_blank" rel="noreferrer"
                      className="ml-auto text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
                      Get key →
                    </a>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mb-2">{meta.help}</div>
                <div className="text-[10px] font-mono text-muted-foreground/70 mb-2">
                  env name: <span className="text-foreground/70">{r.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={isRevealed ? "text" : "password"}
                      value={draft}
                      onChange={(e) => setDrafts((p) => ({ ...p, [r.name]: e.target.value }))}
                      placeholder={r.source === "db" ? "(stored — paste a new value to rotate)" : r.source === "env" ? "(env-var in effect — paste here to override)" : "Paste API key"}
                      className="w-full h-9 px-3 pr-9 text-sm font-mono border border-foreground/15 rounded-md bg-background"
                    />
                    <button type="button"
                      onClick={() => setReveal((p) => ({ ...p, [r.name]: !isRevealed }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                      {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button type="button" onClick={() => saveOne(r.name, draft)}
                    disabled={busy || !draft}
                    className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                  </button>
                  {r.source === "db" && (
                    <button type="button" onClick={() => saveOne(r.name, "")}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md border border-rose-500/30 text-rose-600 hover:bg-rose-500/5 disabled:opacity-50"
                      title="Clear DB-stored key (env-var fallback takes over)">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SourceChip({ source }: { source: "db" | "env" | "none" }) {
  if (source === "db") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border border-emerald-500/20 bg-emerald-500/10 text-emerald-700">
        <Lock className="w-2.5 h-2.5" /> DB
      </span>
    )
  }
  if (source === "env") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border border-blue-500/20 bg-blue-500/10 text-blue-700">
        <Globe className="w-2.5 h-2.5" /> ENV
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border border-foreground/15 bg-foreground/5 text-muted-foreground">
      not set
    </span>
  )
}

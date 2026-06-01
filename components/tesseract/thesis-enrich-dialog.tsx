"use client"

/**
 * ThesisEnrichDialog — shared modal used by Find Investors + LP Matchmaking.
 *
 * Calls POST /api/ai/enrich-thesis with the editor's current thesis +
 * sectors, then lets the user accept individual sector additions and
 * pick one of two AI-rewritten thesis lines.  On confirm it calls
 * onApply({ sectors, thesis }) — the parent decides how to fold the
 * acceptance into its editor.  Read-only otherwise.
 */

import { useEffect, useState } from "react"
import { Loader2, Sparkles, X, Check, AlertTriangle, RefreshCw } from "lucide-react"
import type { AiProvider } from "./ai-status-badge"

interface Props {
  open: boolean
  onClose: () => void
  onApply: (patch: { sectors?: string[]; thesis?: string }) => void
  /** Either "deck" (founder pitch) or "fund" (LP fund profile). */
  kind: "deck" | "fund"
  thesis?: string
  sectors?: string[]
  stage?: string
  hq?: string
  /** Per-run provider override carried through to the enrich API. */
  providerOverride?: AiProvider | "auto"
}

interface Result {
  sectors: string[]
  anchors: string[]
  rewrites: string[]
  provider: string
  aiError: string | null
}

export function ThesisEnrichDialog({ open, onClose, onApply, kind, thesis, sectors, stage, hq, providerOverride }: Props) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Result | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pickedSectors, setPickedSectors] = useState<Set<string>>(new Set())
  const [pickedRewriteIdx, setPickedRewriteIdx] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    setErr(null)
    setData(null)
    try {
      const res = await fetch("/api/ai/enrich-thesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          thesis,
          sectors: sectors ?? [],
          stage,
          hq,
          provider: providerOverride && providerOverride !== "auto" ? providerOverride : undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Enrich failed (${res.status})`)
      setData(json as Result)
      setPickedSectors(new Set(json.sectors ?? []))
      setPickedRewriteIdx(null)
    } catch (e: any) {
      setErr(e?.message ?? "Enrich failed")
    } finally {
      setLoading(false)
    }
  }

  // Run on open.
  useEffect(() => {
    if (open) void load()
    else { setData(null); setPickedSectors(new Set()); setPickedRewriteIdx(null); setErr(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function toggleSector(s: string) {
    setPickedSectors((prev) => {
      const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n
    })
  }

  function apply() {
    const patch: { sectors?: string[]; thesis?: string } = {}
    if (pickedSectors.size) patch.sectors = [...pickedSectors]
    if (pickedRewriteIdx != null && data?.rewrites[pickedRewriteIdx]) patch.thesis = data.rewrites[pickedRewriteIdx]
    onApply(patch)
    onClose()
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40" />
      <div
        className="relative w-[640px] max-w-full max-h-[80vh] overflow-y-auto bg-background border border-foreground/10 rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-foreground/10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
              <Sparkles className="w-3 h-3" /> AI thesis enrich
            </div>
            <h2 className="font-display text-xl">Broaden your {kind === "fund" ? "fund thesis" : "investor pipeline"}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Adjacent sectors, archetypes that typically back this, and two tightened versions of your thesis. You pick what to keep.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
            </div>
          )}
          {err && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {err}
            </div>
          )}

          {data && (
            <>
              {data.aiError && (
                <div className="text-[11px] text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md p-2">
                  AI fallback used: {data.aiError}
                </div>
              )}
              <div className="text-[10px] font-mono text-muted-foreground">via {data.provider}</div>

              {/* Sector adjacencies */}
              <Section title="Adjacent sectors to consider">
                {data.sectors.length === 0 ? (
                  <Empty text="No new sectors suggested." />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {data.sectors.map((s) => {
                      const on = pickedSectors.has(s)
                      return (
                        <button
                          key={s}
                          onClick={() => toggleSector(s)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border ${on ? "bg-foreground text-background border-foreground" : "border-foreground/15 text-muted-foreground hover:border-foreground/40"}`}
                        >
                          {on && <Check className="w-3 h-3" />}
                          {s}
                        </button>
                      )
                    })}
                  </div>
                )}
              </Section>

              {/* Anchor archetypes — informational only */}
              <Section title="Likely investor archetypes">
                {data.anchors.length === 0 ? (
                  <Empty text="None proposed." />
                ) : (
                  <ul className="text-sm space-y-1">
                    {data.anchors.map((a, i) => <li key={i} className="leading-relaxed">• {a}</li>)}
                  </ul>
                )}
              </Section>

              {/* Thesis rewrites */}
              <Section title="Thesis rewrites (pick one to apply)">
                {data.rewrites.length === 0 ? (
                  <Empty text="No rewrites." />
                ) : (
                  <div className="space-y-2">
                    {data.rewrites.map((r, i) => {
                      const on = pickedRewriteIdx === i
                      return (
                        <button
                          key={i}
                          onClick={() => setPickedRewriteIdx(on ? null : i)}
                          className={`block w-full text-left p-3 rounded-md border text-sm leading-relaxed ${on ? "bg-foreground text-background border-foreground" : "border-foreground/15 hover:border-foreground/40"}`}
                        >
                          {r}
                        </button>
                      )
                    })}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>

        <div className="p-4 border-t border-foreground/10 flex items-center justify-between gap-2">
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Rerun
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-md hover:bg-foreground/5">Cancel</button>
            <button
              onClick={apply}
              disabled={!data || (pickedSectors.size === 0 && pickedRewriteIdx == null)}
              className="text-xs px-3 py-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              Apply selected
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      {children}
    </div>
  )
}
function Empty({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground italic">{text}</div>
}

"use client"

/**
 * The two listing opt-ins (docs/architecture/15), in one place.
 *
 * Both are off until someone here turns them on, both say exactly who sees
 * the listing and which fields it carries, and both switch off in one click.
 */
import { useCallback, useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { requestJson } from "@/lib/http/client"

interface CompanyListing { listed: boolean; listedAt: string | null; name: string | null; tagline: string | null; stage: string | null; sectors: string[]; location: string | null; raising: number | null; blocked: string | null }
interface FundListing { fundId: string | null; name: string | null; listed: boolean; listedAt: string | null; blocked: string | null }

export function ListingSettings() {
  const [state, setState] = useState<{ persona: string; company: CompanyListing | null; fund: FundListing | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  const load = useCallback(async () => {
    try { setState(await requestJson("/api/listings")) }
    catch (e) { setMessage({ kind: "error", text: e instanceof Error ? e.message : "Could not load your listing settings." }) }
  }, [])
  useEffect(() => { void load() }, [load])

  const toggle = async (kind: "company" | "fund", listed: boolean) => {
    setBusy(true); setMessage(null)
    try {
      const res = await requestJson<{ company?: CompanyListing; fund?: FundListing }>("/api/listings", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, listed }),
      })
      setState((prev) => prev && { ...prev, ...(res.company ? { company: res.company } : {}), ...(res.fund ? { fund: res.fund } : {}) })
      setMessage({ kind: "ok", text: listed ? "Listed. You can remove it at any time." : "Removed from the directory." })
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "That did not save." })
    } finally { setBusy(false) }
  }

  if (!state) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-6 max-w-3xl">
      {message && (
        <div role="alert" className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${message.kind === "ok" ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
          {message.kind === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}{message.text}
        </div>
      )}

      {state.company && (
        <section className="rounded-lg border border-foreground/10 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl">List my company for investors</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Fund managers browsing Anker can find {state.company.name ?? "your company"} in their Startups directory. Nobody else sees it,
                and no deck, document or CRM record is shared.
              </p>
            </div>
            <Button
              disabled={busy || (!state.company.listed && !!state.company.blocked)}
              onClick={() => toggle("company", !state.company!.listed)}
              className="gap-2 shrink-0"
              variant={state.company.listed ? "outline" : "default"}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : state.company.listed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {state.company.listed ? "Remove listing" : "List my company"}
            </Button>
          </div>

          {state.company.blocked && !state.company.listed && (
            <p className="mt-3 rounded-md border border-foreground/10 bg-foreground/[0.03] p-3 text-sm text-muted-foreground">{state.company.blocked}</p>
          )}

          <div className="mt-4 rounded-md border border-foreground/10 p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">What investors would see</p>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex gap-2"><dt className="text-muted-foreground w-24">Company</dt><dd>{state.company.name ?? "—"}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground w-24">One-liner</dt><dd>{state.company.tagline ?? "—"}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground w-24">Stage</dt><dd>{state.company.stage ?? "—"}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground w-24">Sectors</dt><dd>{state.company.sectors.join(", ") || "—"}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground w-24">Location</dt><dd>{state.company.location ?? "—"}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground w-24">Raising</dt><dd>{state.company.raising ? `$${(state.company.raising / 1e6).toFixed(2)}M` : "—"}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Taken from the profile you keep on Find Investors — update it there and re-list to refresh. Your deck summary, thesis keywords and revenue are never listed.
            </p>
          </div>
          {state.company.listedAt && <p className="mt-2 text-xs text-muted-foreground">Last changed {new Date(state.company.listedAt).toLocaleString()}.</p>}
        </section>
      )}

      {state.fund && (
        <section className="rounded-lg border border-foreground/10 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-xl">List this fund for LPs</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                LPs in the Anker investor room can find {state.fund.name ?? "this fund"} under “Funds on Anker”: name, strategy, vintage, target size and status.
                Your LP list, capital calls, distributions and documents are never shown.
              </p>
            </div>
            <Button
              disabled={busy || (!state.fund.listed && !!state.fund.blocked)}
              onClick={() => toggle("fund", !state.fund!.listed)}
              className="gap-2 shrink-0"
              variant={state.fund.listed ? "outline" : "default"}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : state.fund.listed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {state.fund.listed ? "Remove listing" : "List this fund"}
            </Button>
          </div>
          {state.fund.blocked && <p className="mt-3 rounded-md border border-foreground/10 bg-foreground/[0.03] p-3 text-sm text-muted-foreground">{state.fund.blocked}</p>}
          {state.fund.listedAt && <p className="mt-2 text-xs text-muted-foreground">Last changed {new Date(state.fund.listedAt).toLocaleString()}.</p>}
        </section>
      )}

      {!state.company && !state.fund && (
        <p className="text-sm text-muted-foreground">Listings are for company and fund workspaces.</p>
      )}
    </div>
  )
}

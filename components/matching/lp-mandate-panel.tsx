"use client"

/**
 * Who to look for (docs/architecture/63 section 5): the mandate of this run, and the fund's own rules about who it approaches.
 * The mandate narrows one run. The fund's rules apply to every run until changed; Anker applies them and does not decide who a fund may approach.
 */
import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CLASS_LABELS, REGION_LABELS, REGIONS, classesForPersona, type InvestorClass, type Region } from "@/lib/matching/filters"

const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs transition ${on ? "border-foreground bg-foreground text-background" : "border-foreground/20 hover:bg-foreground/5"}`
const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const CODE = /^[A-Za-z]{2}$/

export function CodeChips({ label, codes, onChange, hint, empty }: { label: string; codes: string[]; onChange: (c: string[]) => void; hint: string; empty: string }) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const parts = draft.split(/[\s,]+/).map((p) => p.trim().toUpperCase()).filter((p) => CODE.test(p))
    if (parts.length) onChange(Array.from(new Set([...codes, ...parts])))
    setDraft("")
  }
  return (
    <fieldset>
      <legend className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{label}</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {codes.map((c) => (
          <button key={c} type="button" onClick={() => onChange(codes.filter((x) => x !== c))} className={chip(true)} aria-label={`Remove ${c}`}>{c} ×</button>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={add}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add() } }}
          placeholder="Add a code, e.g. US" aria-label={`${label}: add a country code`} className="h-7 w-36 px-2 text-xs border border-foreground/20 rounded-full bg-background" />
      </div>
      <p className="text-[10px] font-mono text-muted-foreground mt-2">{codes.length ? hint : empty}</p>
    </fieldset>
  )
}

export interface FundRulesLite { id: string; allowedLpClasses?: string[]; excludedJurisdictions?: string[] }

export function LpMandatePanel(p: {
  regions: Region[]; setRegions: (v: Region[]) => void
  classes: InvestorClass[]; setClasses: (v: InvestorClass[]) => void
  countries: string[]; setCountries: (v: string[]) => void
  includeKnown: boolean; setIncludeKnown: (v: boolean) => void
  fund?: FundRulesLite
  onRulesSaved: (patch: { allowedLpClasses: string[]; excludedJurisdictions: string[] }) => void
  disabled?: boolean
}) {
  const allowedNow = (p.fund?.allowedLpClasses ?? []) as InvestorClass[]
  const jurNow = p.fund?.excludedJurisdictions ?? []
  const [allowed, setAllowed] = useState<InvestorClass[]>(allowedNow)
  const [jur, setJur] = useState<string[]>(jurNow)
  const [saving, setSaving] = useState(false), [msg, setMsg] = useState<string | null>(null)
  const dirty = JSON.stringify([...allowed].sort()) !== JSON.stringify([...allowedNow].sort()) || JSON.stringify([...jur].sort()) !== JSON.stringify([...jurNow].sort())

  async function saveRules() {
    if (!p.fund) return
    setSaving(true); setMsg(null)
    try {
      const r = await fetch(`/api/lp/fund-profiles/${p.fund.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowedLpClasses: allowed, excludedJurisdictions: jur }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || "The rules could not be saved. Only the person who created the profile can change it.")
      p.onRulesSaved({ allowedLpClasses: allowed, excludedJurisdictions: jur })
      setMsg("Saved. Every run now follows these rules.")
    } catch (e: any) { setMsg(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <fieldset disabled={p.disabled} className="space-y-5">
        <fieldset>
          <legend className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Raise from — geography</legend>
          <div className="flex flex-wrap gap-1.5">
            {REGIONS.map((r) => (<button key={r} type="button" aria-pressed={p.regions.includes(r)} onClick={() => p.setRegions(toggle(p.regions, r))} className={chip(p.regions.includes(r))}>{REGION_LABELS[r]}</button>))}
          </div>
          <p className="text-[10px] font-mono text-muted-foreground mt-2">{p.regions.length ? "Only these regions are searched." : "All regions."}</p>
        </fieldset>
        <CodeChips label="Raise from — countries" codes={p.countries} onChange={p.setCountries} hint="Only these countries are searched." empty="All countries. Add two-letter codes (US, DE, GB) to narrow." />
        <fieldset>
          <legend className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Raise from — investor type</legend>
          <div className="flex flex-wrap gap-1.5">
            {classesForPersona("vc").map((c) => (<button key={c} type="button" aria-pressed={p.classes.includes(c)} onClick={() => p.setClasses(toggle(p.classes, c))} className={chip(p.classes.includes(c))}>{CLASS_LABELS[c]}</button>))}
          </div>
          <p className="text-[10px] font-mono text-muted-foreground mt-2">{p.classes.length ? "Only these types are searched." : "All allocator types."}</p>
        </fieldset>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={p.includeKnown} onChange={(e) => p.setIncludeKnown(e.target.checked)} className="mt-1" />
          <span>Also show LPs already in my CRM
            <span className="block text-[10px] font-mono text-muted-foreground">By default, LPs you have contacted, who passed, whom you excluded, or who already invest in your fund are left out.</span>
          </span>
        </label>
      </fieldset>

      {p.fund && (
        <details className="rounded-md border border-foreground/10 p-3 text-sm" open={allowedNow.length > 0 || jurNow.length > 0}>
          <summary className="cursor-pointer font-medium">Your fund&apos;s rules{allowedNow.length || jurNow.length ? ` (${allowedNow.length + jurNow.length} set)` : ""}</summary>
          <div className="mt-3 space-y-4">
            <p className="text-xs text-muted-foreground">These apply to every run until you change them. Anker applies the rules you set here; it does not decide who your fund may approach.</p>
            <fieldset>
              <legend className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Only approach these kinds of investor</legend>
              <div className="flex flex-wrap gap-1.5">
                {classesForPersona("vc").map((c) => (<button key={c} type="button" aria-pressed={allowed.includes(c)} onClick={() => setAllowed(toggle(allowed, c))} className={chip(allowed.includes(c))}>{CLASS_LABELS[c]}</button>))}
              </div>
              <p className="text-[10px] font-mono text-muted-foreground mt-2">{allowed.length ? "Other kinds are never shown." : "Any kind."}</p>
            </fieldset>
            <CodeChips label="Never approach investors in" codes={jur} onChange={setJur} hint="Investors in these countries are left out of every run." empty="No country is excluded." />
            <div className="flex items-center gap-3">
              <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={saveRules}>{saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving</> : "Save the rules"}</Button>
              {msg && <span role="status" className="text-xs text-muted-foreground">{msg}</span>}
            </div>
          </div>
        </details>
      )}
    </div>
  )
}

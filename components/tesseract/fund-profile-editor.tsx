"use client"

/**
 * FundProfileEditor — inline VC fund-profile form for the matchmaking page.
 *
 * Replaces the "go to Settings → Fund Profiles" detour.  All matchmaking-
 * relevant fields live here:
 *
 *   Identity:     name, fund number, vehicle, HQ
 *   Economics:    target raise, hard cap, average LP ticket, min commit,
 *                 mgmt fee, carry, GP commit, fund life
 *   Strategy:     investment stage(s), avg per-portfolio check, target
 *                 number of companies, investment period
 *   Coverage:     sectors (csv), primary sectors (csv), geographic focus,
 *                 thesis keywords (csv)
 *   Narrative:    thesis description, value proposition, GP name(s)
 *
 * Saves via POST /api/lp/fund-profiles (upsert).  Calls onSaved(profile)
 * with the saved row so the parent can refresh its picker / set the
 * selected id.  Designed to be pre-filled by the FundDeckUploader's
 * extraction callback — pass the extracted fields via the `seed` prop.
 */

import { useEffect, useState, useTransition } from "react"
import {
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
} from "lucide-react"

export interface FundProfileEditorValue {
  id?: string
  name: string
  fundNumber?: number | null
  targetRaiseUsd?: number | null
  hardCapUsd?: number | null
  averageTicketUsd?: number | null
  minimumCommitmentUsd?: number | null
  managementFeePct?: number | null
  carryPct?: number | null
  gpCommitmentPct?: number | null
  fundLifeYears?: number | null
  investmentStage?: string | null
  avgCheckSizeUsd?: number | null
  targetCompanies?: number | null
  investmentPeriodYears?: number | null
  sectors: string[]
  primarySectors: string[]
  geographicFocus: string[]
  headquartersLocation?: string | null
  thesisKeywords: string[]
  thesisDescription?: string | null
  valueProposition?: string | null
  gpName?: string | null
  portfolioCompanies: string[]
}

const EMPTY: FundProfileEditorValue = {
  name: "",
  fundNumber: null,
  targetRaiseUsd: null,
  hardCapUsd: null,
  averageTicketUsd: null,
  minimumCommitmentUsd: null,
  managementFeePct: null,
  carryPct: null,
  gpCommitmentPct: null,
  fundLifeYears: 10,
  investmentStage: null,
  avgCheckSizeUsd: null,
  targetCompanies: null,
  investmentPeriodYears: 4,
  sectors: [],
  primarySectors: [],
  geographicFocus: [],
  headquartersLocation: null,
  thesisKeywords: [],
  thesisDescription: null,
  valueProposition: null,
  gpName: null,
  portfolioCompanies: [],
}

interface Props {
  /** Optional initial value — used by the parent to load an existing
   *  profile from the DB, OR to seed from a fresh deck extraction. */
  initial?: Partial<FundProfileEditorValue> | null
  /** When supplied, the editor calls this after a successful save with
   *  the saved profile (already serialized).  The parent typically
   *  refreshes its picker + selects this id. */
  onSaved?: (saved: any) => void
  /** Render collapsed by default — useful when an existing profile is
   *  selected and the user just wants the picker. */
  defaultCollapsed?: boolean
  className?: string
}

export function FundProfileEditor({ initial, onSaved, defaultCollapsed = false, className = "" }: Props) {
  const [v, setV] = useState<FundProfileEditorValue>({ ...EMPTY, ...(initial ?? {}) })
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [pending, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // When `initial` changes (deck extraction completes), merge non-null
  // fields without clobbering edits the user already made.
  useEffect(() => {
    if (!initial) return
    setV((prev) => ({ ...prev, ...stripNulls(initial) }))
    setCollapsed(false) // expand so the user can see what got filled in
  }, [initial])

  function set<K extends keyof FundProfileEditorValue>(k: K, val: FundProfileEditorValue[K]) {
    setV((prev) => ({ ...prev, [k]: val }))
  }

  async function save() {
    if (!v.name.trim()) {
      setError("Fund name is required.")
      return
    }
    setError(null)
    startSaving(async () => {
      try {
        const body = {
          id: v.id,
          name: v.name.trim(),
          fundNumber: v.fundNumber ?? null,
          targetRaise: v.targetRaiseUsd ?? null,
          hardCap: v.hardCapUsd ?? null,
          averageTicket: v.averageTicketUsd ?? null,
          minimumCommitment: v.minimumCommitmentUsd ?? null,
          managementFee: v.managementFeePct ?? null,
          carry: v.carryPct ?? null,
          gpCommitment: v.gpCommitmentPct ?? null,
          fundLife: v.fundLifeYears ?? null,
          investmentStage: v.investmentStage ?? null,
          avgCheckSize: v.avgCheckSizeUsd ?? null,
          targetCompanies: v.targetCompanies ?? null,
          investmentPeriod: v.investmentPeriodYears ?? null,
          sectors: v.sectors,
          primarySectors: v.primarySectors.length ? v.primarySectors : v.sectors.slice(0, 3),
          geographicFocus: v.geographicFocus,
          headquartersLocation: v.headquartersLocation ?? null,
          thesisKeywords: v.thesisKeywords,
          thesisDescription: v.thesisDescription ?? null,
          valueProposition: v.valueProposition ?? null,
          gpName: v.gpName ?? null,
          portfolioCompanies: v.portfolioCompanies,
        }
        const res = await fetch("/api/lp/fund-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`)
        setSavedAt(Date.now())
        if (data.profile?.id) setV((prev) => ({ ...prev, id: data.profile.id }))
        onSaved?.(data.profile)
      } catch (e: any) {
        setError(e?.message ?? "Save failed")
      }
    })
  }

  return (
    <div className={`border border-foreground/10 rounded-lg ${className}`}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-display text-lg">
            {v.id ? "Edit fund profile" : "Create fund profile"}
            {v.name && <span className="text-muted-foreground font-normal"> — {v.name}</span>}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && Date.now() - savedAt < 4000 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600">
              <CheckCircle2 className="w-3 h-3" /> Saved
            </span>
          )}
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-5 pb-5 space-y-5 border-t border-foreground/10">
          {/* Identity */}
          <Section title="Identity">
            <Field label="Fund name" required>
              <input
                type="text"
                value={v.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Acme Ventures Fund II"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
            <Field label="Fund number" hint="1 = Fund I, 2 = Fund II, …">
              <input
                type="number"
                value={v.fundNumber ?? ""}
                onChange={(e) => set("fundNumber", parseIntOrNull(e.target.value))}
                placeholder="2"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
            <Field label="HQ" hint="city, state, country">
              <input
                type="text"
                value={v.headquartersLocation ?? ""}
                onChange={(e) => set("headquartersLocation", e.target.value || null)}
                placeholder="New York, NY, USA"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
            <Field label="GP name(s)" hint="comma-separated">
              <input
                type="text"
                value={v.gpName ?? ""}
                onChange={(e) => set("gpName", e.target.value || null)}
                placeholder="Jane Doe, John Smith"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
          </Section>

          {/* Economics */}
          <Section title="Fund economics">
            <Field label="Target raise (USD)">
              <input
                type="number"
                value={v.targetRaiseUsd ?? ""}
                onChange={(e) => set("targetRaiseUsd", parseIntOrNull(e.target.value))}
                placeholder="50000000"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background font-mono"
              />
            </Field>
            <Field label="Hard cap (USD)">
              <input
                type="number"
                value={v.hardCapUsd ?? ""}
                onChange={(e) => set("hardCapUsd", parseIntOrNull(e.target.value))}
                placeholder="60000000"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background font-mono"
              />
            </Field>
            <Field label="Avg LP ticket (USD)">
              <input
                type="number"
                value={v.averageTicketUsd ?? ""}
                onChange={(e) => set("averageTicketUsd", parseIntOrNull(e.target.value))}
                placeholder="2000000"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background font-mono"
              />
            </Field>
            <Field label="Min LP commit (USD)">
              <input
                type="number"
                value={v.minimumCommitmentUsd ?? ""}
                onChange={(e) => set("minimumCommitmentUsd", parseIntOrNull(e.target.value))}
                placeholder="500000"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background font-mono"
              />
            </Field>
            <Field label="Mgmt fee %">
              <input
                type="number"
                step="0.1"
                value={v.managementFeePct ?? ""}
                onChange={(e) => set("managementFeePct", parseFloatOrNull(e.target.value))}
                placeholder="2.0"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background font-mono"
              />
            </Field>
            <Field label="Carry %">
              <input
                type="number"
                step="0.5"
                value={v.carryPct ?? ""}
                onChange={(e) => set("carryPct", parseFloatOrNull(e.target.value))}
                placeholder="20"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background font-mono"
              />
            </Field>
            <Field label="GP commit %">
              <input
                type="number"
                step="0.1"
                value={v.gpCommitmentPct ?? ""}
                onChange={(e) => set("gpCommitmentPct", parseFloatOrNull(e.target.value))}
                placeholder="1.0"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background font-mono"
              />
            </Field>
            <Field label="Fund life (years)">
              <input
                type="number"
                value={v.fundLifeYears ?? ""}
                onChange={(e) => set("fundLifeYears", parseIntOrNull(e.target.value))}
                placeholder="10"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background font-mono"
              />
            </Field>
          </Section>

          {/* Investment strategy */}
          <Section title="Investment strategy">
            <Field label="Stage focus" hint="pre-seed, seed, series-a, series-b, growth">
              <input
                type="text"
                value={v.investmentStage ?? ""}
                onChange={(e) => set("investmentStage", e.target.value || null)}
                placeholder="seed, series-a"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
            <Field label="Avg check / company (USD)">
              <input
                type="number"
                value={v.avgCheckSizeUsd ?? ""}
                onChange={(e) => set("avgCheckSizeUsd", parseIntOrNull(e.target.value))}
                placeholder="1500000"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background font-mono"
              />
            </Field>
            <Field label="Target portfolio companies">
              <input
                type="number"
                value={v.targetCompanies ?? ""}
                onChange={(e) => set("targetCompanies", parseIntOrNull(e.target.value))}
                placeholder="25"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background font-mono"
              />
            </Field>
            <Field label="Investment period (years)">
              <input
                type="number"
                value={v.investmentPeriodYears ?? ""}
                onChange={(e) => set("investmentPeriodYears", parseIntOrNull(e.target.value))}
                placeholder="4"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background font-mono"
              />
            </Field>
          </Section>

          {/* Coverage */}
          <Section title="Coverage" cols={1}>
            <Field label="Sectors" hint="comma-separated, lowercase tags">
              <input
                type="text"
                value={v.sectors.join(", ")}
                onChange={(e) => set("sectors", parseCsv(e.target.value))}
                placeholder="ai/ml, fintech, climate"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
            <Field label="Primary sectors" hint="subset of sectors that get +20 sweet-spot bonus">
              <input
                type="text"
                value={v.primarySectors.join(", ")}
                onChange={(e) => set("primarySectors", parseCsv(e.target.value))}
                placeholder="ai/ml"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
            <Field label="Geographic focus" hint="us, eu, dach, gulf, latam, sea, …">
              <input
                type="text"
                value={v.geographicFocus.join(", ")}
                onChange={(e) => set("geographicFocus", parseCsv(e.target.value))}
                placeholder="us, eu"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
            <Field label="Thesis keywords" hint="3-8 short phrases, comma-separated">
              <input
                type="text"
                value={v.thesisKeywords.join(", ")}
                onChange={(e) => set("thesisKeywords", parseCsv(e.target.value))}
                placeholder="defense onshoring, energy transition, agentic AI"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
          </Section>

          {/* Narrative */}
          <Section title="Narrative" cols={1}>
            <Field label="Thesis description">
              <textarea
                value={v.thesisDescription ?? ""}
                onChange={(e) => set("thesisDescription", e.target.value || null)}
                rows={3}
                placeholder="2-3 sentence description of the fund's investment thesis."
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
            <Field label="Value proposition">
              <textarea
                value={v.valueProposition ?? ""}
                onChange={(e) => set("valueProposition", e.target.value || null)}
                rows={2}
                placeholder="What you bring beyond capital."
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
            <Field label="Top portfolio companies" hint="comma-separated">
              <input
                type="text"
                value={v.portfolioCompanies.join(", ")}
                onChange={(e) => set("portfolioCompanies", parseCsv(e.target.value))}
                placeholder="Stripe, Notion, Linear"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
          </Section>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-md text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="text-rose-700 dark:text-rose-400">{error}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-sm hover:bg-foreground/90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {v.id ? "Save changes" : "Create profile"}
            </button>
            {v.id && (
              <span className="text-[11px] font-mono text-muted-foreground">
                id: {v.id.slice(0, 12)}…
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── small helpers ─────────────────────────────────────────────────────────
function Section({
  title,
  cols = 2,
  children,
}: {
  title: string
  cols?: 1 | 2
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </div>
      <div className={`grid ${cols === 1 ? "grid-cols-1" : "md:grid-cols-2"} gap-3`}>{children}</div>
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs">
          {label} {required && <span className="text-rose-600">*</span>}
        </span>
        {hint && <span className="text-[10px] font-mono text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

function parseCsv(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean)
}
function parseIntOrNull(s: string): number | null {
  if (!s.trim()) return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}
function parseFloatOrNull(s: string): number | null {
  if (!s.trim()) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}
function stripNulls<T extends object>(o: Partial<T>): Partial<T> {
  const out: any = {}
  for (const [k, v] of Object.entries(o)) {
    if (v != null && !(Array.isArray(v) && v.length === 0)) out[k] = v
  }
  return out
}

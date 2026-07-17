"use client"

/**
 * ComplianceClient — the fund's regulatory obligation register.
 *
 * Left: a short intake profile whose answers drive applicability. Right: the
 * catalog of obligations grouped by category, each showing its computed
 * applicability, deadline, and a menu to override / dismiss / mark filed.
 *
 * Feature adapted from Hemrock Portfolio Reporting (Apache-2.0); see NOTICE.
 */

import { useMemo, useState } from "react"
import {
  ShieldCheck, AlertTriangle, CheckCircle2, Clock, HelpCircle, EyeOff,
  ExternalLink, Loader2, ChevronDown, Calendar, X,
} from "lucide-react"

type Applicability = "applies" | "not_applicable" | "needs_review" | "monitor" | "completed"

interface Item {
  id: string; category: string; name: string; short_name: string; description: string
  frequency: string; deadline_description: string; applicability_question: string
  filing_system: string; filing_portal_url: string | null; regulation_url: string | null
  complexity: string; notes: string | null; alert: string | null
}
interface Deadline { id: string; year: number; due_date: string | null; status: string; filed_date: string | null }
interface RegisterRow {
  item: Item; applicability: Applicability; reason: string; dismissed: boolean
  notes: string | null; deadline: Deadline | null
}
interface Profile {
  registration_status: string | null; aum_range: string | null; fund_structure: string | null
  reg_d_exemption: string | null; investor_state_count: string | null; public_equity: string | null
  cftc_activity: string | null; has_foreign_entities: string | null; has_foreign_investors: string | null
  california_nexus: string[] | null
  completed_at?: string | null
}
interface Summary { total: number; applies: number; needsReview: number; filed: number; overdue: number }

const INTAKE: Array<{ key: keyof Profile; label: string; options: Array<[string, string]> }> = [
  { key: "registration_status", label: "SEC registration", options: [["ria", "Registered (RIA)"], ["era", "Exempt Reporting Adviser"], ["not_registered", "Not registered"], ["unsure", "Unsure"]] },
  { key: "aum_range", label: "Private-fund AUM", options: [["under_25m", "< $25M"], ["25m_100m", "$25–100M"], ["100m_150m", "$100–150M"], ["150m_500m", "$150–500M"], ["500m_1.5b", "$500M–1.5B"], ["over_1.5b", "> $1.5B"], ["unsure", "Unsure"]] },
  { key: "fund_structure", label: "Fund structure", options: [["lp", "Limited Partnership"], ["llc_partnership", "LLC (partnership)"], ["llc_corp", "LLC (taxed as corp)"], ["other", "Other"]] },
  { key: "reg_d_exemption", label: "Reg D offering", options: [["506b", "Rule 506(b)"], ["506c", "Rule 506(c)"], ["no", "Not under Reg D"], ["unsure", "Unsure"]] },
  { key: "investor_state_count", label: "Investor states", options: [["single_state", "One state"], ["2_to_5", "2–5"], ["6_to_15", "6–15"], ["16_plus", "16+"], ["unsure", "Unsure"]] },
  { key: "public_equity", label: "Public equity holdings", options: [["yes_over_100m", "$100M+"], ["yes_under_100m", "Under $100M"], ["yes_5pct_single", "5%+ of one company"], ["no", "None"], ["unsure", "Unsure"]] },
  { key: "cftc_activity", label: "Commodity/futures activity", options: [["yes_with_exemption", "Yes, exemption filed"], ["yes_no_exemption", "Yes, no exemption"], ["no", "None"], ["unsure", "Unsure"]] },
  { key: "has_foreign_entities", label: "Foreign-formed entities", options: [["yes", "Yes"], ["no", "No"]] },
  { key: "has_foreign_investors", label: "Foreign investors", options: [["yes", "Yes"], ["no", "No"], ["unsure", "Unsure"]] },
]

const BADGE: Record<Applicability, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  applies: { label: "Applies", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", Icon: CheckCircle2 },
  not_applicable: { label: "N/A", cls: "bg-foreground/5 text-muted-foreground border-foreground/10", Icon: EyeOff },
  needs_review: { label: "Review", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", Icon: HelpCircle },
  monitor: { label: "Monitor", cls: "bg-sky-500/10 text-sky-600 border-sky-500/20", Icon: Clock },
  completed: { label: "Done", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", Icon: CheckCircle2 },
}

const DEADLINE_STATUSES = ["upcoming", "in_progress", "filed", "extended", "overdue", "not_applicable"]

export function ComplianceClient({
  fundId, year, initialProfile, initialRegister, initialSummary,
}: {
  fundId: string; year: number
  initialProfile: Profile | null
  initialRegister: RegisterRow[]
  initialSummary: Summary
}) {
  const [profile, setProfile] = useState<Profile>(initialProfile ?? emptyProfile())
  const [register, setRegister] = useState<RegisterRow[]>(initialRegister)
  const [summary, setSummary] = useState<Summary>(initialSummary)
  const [savingProfile, setSavingProfile] = useState(false)
  const [busyItem, setBusyItem] = useState<string | null>(null)
  const [genBusy, setGenBusy] = useState(false)
  const [showNA, setShowNA] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  async function refresh() {
    const r = await fetch(`/api/portfolio/compliance?fundId=${encodeURIComponent(fundId)}&year=${year}`)
    if (r.ok) {
      const d = await r.json()
      setRegister(d.register); setSummary(d.summary); setProfile(d.profile)
    }
  }

  async function saveProfile() {
    setSavingProfile(true)
    try {
      await fetch(`/api/portfolio/compliance/profile`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundId, ...profile }),
      })
      await refresh()
    } finally { setSavingProfile(false) }
  }

  async function patchSetting(itemId: string, patch: Record<string, unknown>) {
    setBusyItem(itemId); setOpenMenu(null)
    try {
      await fetch(`/api/portfolio/compliance/settings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundId, compliance_item_id: itemId, ...patch }),
      })
      await refresh()
    } finally { setBusyItem(null) }
  }

  async function generate() {
    setGenBusy(true)
    try {
      await fetch(`/api/portfolio/compliance/deadlines`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundId, year }),
      })
      await refresh()
    } finally { setGenBusy(false) }
  }

  async function setDeadlineStatus(deadlineId: string, status: string) {
    await fetch(`/api/portfolio/compliance/deadlines`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fundId, deadlineId, status, filed_date: status === "filed" ? new Date().toISOString().slice(0, 10) : null }),
    })
    await refresh()
  }

  const grouped = useMemo(() => {
    const visible = register.filter((r) => showNA || (r.applicability !== "not_applicable" && !r.dismissed))
    const map = new Map<string, RegisterRow[]>()
    for (const r of visible) {
      const arr = map.get(r.item.category) ?? []
      arr.push(r); map.set(r.item.category, arr)
    }
    return Array.from(map.entries())
  }, [register, showNA])

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Fund & studio · Compliance
          </div>
          <h1 className="font-display text-3xl tracking-tight">Compliance register</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            The regulatory obligations a U.S. VC fund faces — SEC filings, securities, tax, and fund
            reporting. Answer the profile and the register flags what applies to this fund.
          </p>
        </div>
        <button onClick={generate} disabled={genBusy}
          className="shrink-0 h-9 px-3.5 rounded-md bg-foreground text-background text-sm flex items-center gap-2 disabled:opacity-50">
          {genBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
          Generate {year} deadlines
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-foreground/10 rounded-lg overflow-hidden mb-6">
        {[
          ["Obligations", summary.total, ""],
          ["Applies", summary.applies, "text-emerald-600"],
          ["Needs review", summary.needsReview, "text-amber-600"],
          ["Filed", summary.filed, "text-emerald-600"],
          ["Overdue", summary.overdue, summary.overdue ? "text-red-600" : ""],
        ].map(([label, val, cls]) => (
          <div key={label as string} className="bg-background p-4">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className={`font-display text-2xl mt-0.5 ${cls}`}>{val as number}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-8">
        {/* Intake profile */}
        <aside className="space-y-4">
          <div className="border border-foreground/10 rounded-lg p-4">
            <h2 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Fund profile</h2>
            <div className="space-y-3">
              {INTAKE.map(({ key, label, options }) => (
                <div key={key as string}>
                  <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                  <select
                    value={(profile[key] as string) ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value || null }))}
                    className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm">
                    <option value="">—</option>
                    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button onClick={saveProfile} disabled={savingProfile}
              className="mt-4 w-full h-9 rounded-md border border-foreground/15 text-sm flex items-center justify-center gap-2 hover:bg-foreground/[0.03] disabled:opacity-50">
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save & re-evaluate
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground px-1">
            <input type="checkbox" checked={showNA} onChange={(e) => setShowNA(e.target.checked)} />
            Show not-applicable / dismissed
          </label>
        </aside>

        {/* Register */}
        <div className="space-y-6">
          {grouped.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing to show. Fill in the profile on the left.</p>
          )}
          {grouped.map(([category, rows]) => (
            <section key={category}>
              <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{category}</h3>
              <div className="border border-foreground/10 rounded-lg divide-y divide-foreground/5">
                {rows.map((row) => {
                  const b = BADGE[row.applicability]
                  return (
                    <div key={row.item.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{row.item.name}</span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wide ${b.cls}`}>
                              <b.Icon className="w-3 h-3" /> {b.label}
                            </span>
                            <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground px-1.5 py-0.5 rounded bg-foreground/5">
                              {row.item.frequency}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{row.item.description}</p>
                          <p className="text-[11px] text-muted-foreground/80 mt-1">
                            <span className="font-mono">Due:</span> {row.item.deadline_description}
                          </p>
                          {row.item.alert && (
                            <p className="text-[11px] text-amber-600 mt-1 flex items-start gap-1">
                              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {row.item.alert}
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground/70 mt-1 italic">{row.reason}</p>
                          <div className="flex items-center gap-3 mt-2">
                            {row.item.regulation_url && (
                              <a href={row.item.regulation_url} target="_blank" rel="noreferrer"
                                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                                Regulation <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            {row.item.filing_portal_url && (
                              <a href={row.item.filing_portal_url} target="_blank" rel="noreferrer"
                                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                                {row.item.filing_system} <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          {row.deadline && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-[11px] font-mono text-muted-foreground">{year} deadline{row.deadline.due_date ? ` · ${row.deadline.due_date}` : ""}</span>
                              <select value={row.deadline.status}
                                onChange={(e) => setDeadlineStatus(row.deadline!.id, e.target.value)}
                                className="h-7 px-2 rounded border border-input bg-background text-[11px]">
                                {DEADLINE_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                              </select>
                            </div>
                          )}
                        </div>

                        {/* Row menu */}
                        <div className="relative shrink-0">
                          <button onClick={() => setOpenMenu(openMenu === row.item.id ? null : row.item.id)}
                            className="h-8 px-2.5 rounded-md border border-foreground/15 text-xs flex items-center gap-1 hover:bg-foreground/[0.03]">
                            {busyItem === row.item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <>Actions <ChevronDown className="w-3.5 h-3.5" /></>}
                          </button>
                          {openMenu === row.item.id && (
                            <div className="absolute right-0 top-9 z-10 w-44 bg-background border border-foreground/10 rounded-md shadow-lg py-1 text-sm">
                              <button onClick={() => patchSetting(row.item.id, { applies: "yes" })} className="w-full text-left px-3 py-1.5 hover:bg-foreground/5">Mark applies</button>
                              <button onClick={() => patchSetting(row.item.id, { applies: "no" })} className="w-full text-left px-3 py-1.5 hover:bg-foreground/5">Mark N/A</button>
                              <button onClick={() => patchSetting(row.item.id, { dismissed: true, dismissed_reason: "Dismissed by admin" })} className="w-full text-left px-3 py-1.5 hover:bg-foreground/5 text-muted-foreground">Dismiss</button>
                              {row.dismissed && (
                                <button onClick={() => patchSetting(row.item.id, { dismissed: false })} className="w-full text-left px-3 py-1.5 hover:bg-foreground/5">Un-dismiss</button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground mt-8 pt-4 border-t border-foreground/10 flex items-start gap-1.5">
        <X className="w-3 h-3 mt-0.5 shrink-0 opacity-0" />
        This register is an operational aid, not legal advice. Deadlines and applicability are
        general to U.S. VC funds — confirm each obligation against your LPA and with counsel.
      </p>
    </div>
  )
}

function emptyProfile(): Profile {
  return {
    registration_status: null, aum_range: null, fund_structure: null, reg_d_exemption: null,
    investor_state_count: null, public_equity: null, cftc_activity: null,
    has_foreign_entities: null, has_foreign_investors: null, california_nexus: null, completed_at: null,
  }
}

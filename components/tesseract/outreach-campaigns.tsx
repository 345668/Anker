"use client"

/**
 * OutreachCampaigns — the rebuilt /dashboard/outreach page.
 *
 *   Left column   : campaign list (named, switchable, renameable).
 *   Center column : members table — every investor planned in the
 *                   active campaign, joined with their full CRM profile
 *                   (name, title, type, score, research brief, contact),
 *                   plus per-row draft status and remove.
 *   Right column  : template library — built-ins by category + the
 *                   user's saved custom templates.  Preview a template,
 *                   pick a channel + provider override, then bulk-draft
 *                   across all members (or just the selected ones).
 *
 * Investors are queued here from the CRM (bulk "Send to outreach"
 * action) — this page is the working surface for actually drafting.
 * Drafts only.  No auto-send.
 */

import { useEffect, useMemo, useState, useTransition } from "react"
import {
  Plus, Loader2, Sparkles, Mail, Linkedin, Trash2, Pencil, Check, X,
  Search, ChevronDown, ChevronRight, Send, Copy, Save, AlertTriangle,
  Inbox, MessageSquare, Star,
} from "lucide-react"
import { FounderContextCard, useFounderContext } from "./founder-context-card"
import { AiStatusBadge, type AiProvider } from "./ai-status-badge"

interface CampaignSummary {
  id: string
  name: string
  description: string | null
  status: "draft" | "active" | "paused" | "done"
  defaultChannel: "email" | "linkedin" | "multi"
  defaultTemplateId: string | null
  counts: { members: number; drafted: number; sent: number }
}

interface MemberRow {
  id: string
  crmEntryId: string
  status: "planned" | "drafted" | "sent" | "skipped" | "replied"
  notes: string | null
  addedAt: string | null
  draftedAt: string | null
  sentAt: string | null
  displayName: string
  displayTitle: string | null
  displayEmail: string | null
  displayLinkedin: string | null
  displayLocation: string | null
  displayType: string | null
  displayScore: number | null
  displayTier: string | null
  whyMatch: string | null
  researchSummary: string | null
  researchUrl: string | null
  crmStage: string | null
}

interface TemplateRow {
  id: string
  name: string
  category: string
  channel: "email" | "linkedin" | "multi"
  subject?: string
  body: string
  variables: string[]
  builtin: boolean
  isDefault?: boolean
  forkedFrom?: string | null
}

const STATUS_FILTERS = ["all", "planned", "drafted", "sent", "skipped", "replied"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const STATUS_COLOR: Record<MemberRow["status"], string> = {
  planned: "bg-slate-100 text-slate-700",
  drafted: "bg-amber-100 text-amber-700",
  sent: "bg-emerald-100 text-emerald-700",
  skipped: "bg-rose-100 text-rose-700",
  replied: "bg-violet-100 text-violet-700",
}

interface Props {
  initialCampaigns: CampaignSummary[]
  initialTemplates: { builtins: TemplateRow[]; user: TemplateRow[]; categories: string[] }
}

export function OutreachCampaigns({ initialCampaigns, initialTemplates }: Props) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>(initialCampaigns)
  const [activeId, setActiveId] = useState<string>(initialCampaigns[0]?.id ?? "")
  const [members, setMembers] = useState<MemberRow[]>([])
  const [templates, setTemplates] = useState(initialTemplates)
  const [activeTemplateId, setActiveTemplateId] = useState<string>(initialTemplates.builtins[0]?.id ?? "")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [filter, setFilter] = useState("")
  const [aiOverride, setAiOverride] = useState<AiProvider | "auto">("auto")
  const [personalize, setPersonalize] = useState(true)
  const [channel, setChannel] = useState<"email" | "linkedin">("email")
  const [founder, setFounder] = useFounderContext()
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [drafting, startDrafting] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [draftResult, setDraftResult] = useState<{ drafted: number; provider: string | null } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState("")
  const [showTemplateForm, setShowTemplateForm] = useState(false)

  // Active campaign + active template (derived).
  const activeCampaign = useMemo(() => campaigns.find((c) => c.id === activeId), [campaigns, activeId])
  const allTemplates: TemplateRow[] = useMemo(
    () => [...templates.builtins, ...templates.user],
    [templates],
  )
  const activeTemplate = useMemo(
    () => allTemplates.find((t) => t.id === activeTemplateId) ?? null,
    [allTemplates, activeTemplateId],
  )

  // Filtered members.
  const visibleMembers = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return members.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false
      if (!q) return true
      return (
        m.displayName.toLowerCase().includes(q) ||
        (m.displayTitle ?? "").toLowerCase().includes(q) ||
        (m.displayType ?? "").toLowerCase().includes(q) ||
        (m.displayEmail ?? "").toLowerCase().includes(q) ||
        (m.whyMatch ?? "").toLowerCase().includes(q)
      )
    })
  }, [members, statusFilter, filter])

  // Load members when active campaign changes.
  useEffect(() => {
    setSelected(new Set())
    setDraftResult(null)
    setError(null)
    if (!activeId) { setMembers([]); return }
    void loadMembers(activeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  async function loadMembers(id: string) {
    setLoadingMembers(true)
    try {
      const res = await fetch(`/api/outreach/campaigns/${id}/members`)
      if (!res.ok) { setMembers([]); return }
      const data = await res.json()
      setMembers(data?.members ?? [])
    } catch { setMembers([]) }
    finally { setLoadingMembers(false) }
  }

  async function reloadCampaigns() {
    const res = await fetch("/api/outreach/campaigns")
    if (!res.ok) return
    const data = await res.json()
    setCampaigns(data?.campaigns ?? [])
  }
  async function reloadTemplates() {
    const res = await fetch("/api/outreach/templates")
    if (!res.ok) return
    const data = await res.json()
    setTemplates({
      builtins: data?.builtins ?? [],
      user: data?.user ?? [],
      categories: data?.categories ?? [],
    })
  }

  // ─── campaign actions ────────────────────────────────────────────────
  async function createCampaign() {
    const name = prompt("Name this campaign (e.g. 'Q4 climate LPs')")?.trim()
    if (!name) return
    try {
      const res = await fetch("/api/outreach/campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error ?? "Create failed"); return }
      setCampaigns((prev) => [{ ...data.campaign, counts: { members: 0, drafted: 0, sent: 0 } }, ...prev])
      setActiveId(data.campaign.id)
    } catch (e: any) { setError(e?.message ?? "Create failed") }
  }
  function startRename(c: CampaignSummary) { setRenaming(c.id); setRenameVal(c.name) }
  async function commitRename(id: string) {
    const name = renameVal.trim()
    setRenaming(null)
    if (!name) return
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)))
    try {
      await fetch(`/api/outreach/campaigns/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
    } catch {/* swallow */}
  }
  async function deleteCampaign(c: CampaignSummary) {
    if (!confirm(`Delete campaign "${c.name}"? Members go back to their CRM rows (not deleted).`)) return
    try {
      const res = await fetch(`/api/outreach/campaigns/${c.id}`, { method: "DELETE" })
      if (!res.ok) return
      setCampaigns((prev) => prev.filter((x) => x.id !== c.id))
      if (activeId === c.id) setActiveId(campaigns.find((x) => x.id !== c.id)?.id ?? "")
    } catch {/* swallow */}
  }
  async function setCampaignStatus(c: CampaignSummary, status: CampaignSummary["status"]) {
    setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, status } : x)))
    try {
      await fetch(`/api/outreach/campaigns/${c.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
    } catch {/* swallow */}
  }

  // ─── member actions ──────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAll(ids: string[]) {
    setSelected((prev) => {
      const allOn = ids.every((id) => prev.has(id))
      const n = new Set(prev)
      ids.forEach((id) => (allOn ? n.delete(id) : n.add(id)))
      return n
    })
  }
  async function setMemberStatus(m: MemberRow, status: MemberRow["status"]) {
    setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, status } : x)))
    try {
      await fetch(`/api/outreach/campaigns/${activeId}/members/${m.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
    } catch {/* swallow */}
  }
  async function removeMember(m: MemberRow) {
    if (!confirm(`Remove ${m.displayName} from this campaign? Their CRM row stays.`)) return
    setMembers((prev) => prev.filter((x) => x.id !== m.id))
    try {
      await fetch(`/api/outreach/campaigns/${activeId}/members/${m.id}`, { method: "DELETE" })
    } catch {/* swallow */}
  }

  // ─── draft ───────────────────────────────────────────────────────────
  function bulkDraft() {
    if (!activeId || !activeTemplate) { setError("Pick a template first."); return }
    if (!members.length) { setError("No members to draft for."); return }
    setError(null); setDraftResult(null)
    const memberIds = selected.size ? [...selected] : undefined
    startDrafting(async () => {
      try {
        const res = await fetch(`/api/outreach/campaigns/${activeId}/draft`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId: activeTemplate.id,
            memberIds,
            founder,
            channel,
            personalize,
            provider: aiOverride === "auto" ? undefined : aiOverride,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setError(data?.error ?? "Draft failed"); return }
        setDraftResult({ drafted: data.drafted ?? 0, provider: data.provider ?? null })
        await loadMembers(activeId)
        await reloadCampaigns()
      } catch (e: any) { setError(e?.message ?? "Draft failed") }
    })
  }

  const allVisibleIds = visibleMembers.map((m) => m.id)
  const allChecked = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id))

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-foreground/10">
        <div className="px-8 py-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="font-display text-2xl">Outreach</h1>
              <p className="text-sm text-muted-foreground">
                Drive cohorts of investors from the CRM into named campaigns, draft with templates + AI, track replies.
              </p>
            </div>
            <AiStatusBadge
              title="AI engine"
              override={aiOverride}
              onOverrideChange={setAiOverride}
              className="min-w-[280px]"
            />
          </div>
          <FounderContextCard ctx={founder} onChange={setFounder} defaultCollapsed className="mt-4" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 px-8 py-6">
        {/* ── Campaigns sidebar ── */}
        <aside className="lg:col-span-3 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">Campaigns</h2>
            <button
              onClick={createCampaign}
              className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
          {campaigns.length === 0 && (
            <div className="border border-dashed border-foreground/15 rounded-md p-4 text-xs text-muted-foreground">
              No campaigns yet. Create one, then send investors from the CRM with "Send selected to Outreach".
            </div>
          )}
          <div className="space-y-1">
            {campaigns.map((c) => (
              <div key={c.id} className="group">
                {renaming === c.id ? (
                  <div className="flex items-center gap-1 p-2 rounded-md border border-blue-400">
                    <input
                      autoFocus value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitRename(c.id); if (e.key === "Escape") setRenaming(null) }}
                      className="flex-1 text-xs focus:outline-none bg-background"
                    />
                    <button onClick={() => commitRename(c.id)} className="text-emerald-600"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setRenaming(null)} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setActiveId(c.id)}
                    onDoubleClick={() => startRename(c)}
                    className={`w-full text-left p-2 rounded-md border ${activeId === c.id ? "bg-foreground text-background border-foreground" : "border-foreground/15 hover:border-foreground/30"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm truncate">{c.name}</div>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        c.status === "active" ? "bg-emerald-100 text-emerald-700"
                          : c.status === "paused" ? "bg-amber-100 text-amber-700"
                          : c.status === "done" ? "bg-violet-100 text-violet-700"
                          : "bg-foreground/10"
                      } ${activeId === c.id ? "ring-1 ring-background/40" : ""}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className={`text-[10px] font-mono mt-1 flex items-center gap-2 ${activeId === c.id ? "text-background/70" : "text-muted-foreground"}`}>
                      <span>{c.counts.members} planned</span>
                      <span>·</span>
                      <span>{c.counts.drafted} drafted</span>
                      <span>·</span>
                      <span>{c.counts.sent} sent</span>
                    </div>
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* ── Members center ── */}
        <section className="lg:col-span-6 space-y-3">
          {!activeCampaign ? (
            <div className="border border-dashed border-foreground/15 rounded-md p-8 text-center text-sm text-muted-foreground">
              <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Pick or create a campaign on the left.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg">{activeCampaign.name}</h2>
                  <button onClick={() => startRename(activeCampaign)} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>
                  <button onClick={() => deleteCampaign(activeCampaign)} className="text-muted-foreground hover:text-rose-600"><Trash2 className="w-3 h-3" /></button>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {(["draft", "active", "paused", "done"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setCampaignStatus(activeCampaign, s)}
                      className={`px-2 py-1 rounded font-mono ${activeCampaign.status === s ? "bg-foreground text-background" : "border border-foreground/15 text-muted-foreground hover:border-foreground/30"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search members…"
                    className="w-full pl-8 pr-2 py-1.5 text-xs border border-foreground/15 rounded-md bg-background"
                  />
                </div>
                <div className="flex items-center gap-1">
                  {STATUS_FILTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`text-[10px] font-mono px-2 py-1 rounded ${statusFilter === s ? "bg-foreground text-background" : "border border-foreground/15 text-muted-foreground hover:border-foreground/30"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bulk draft bar */}
              <div className="border border-foreground/15 rounded-md p-3 bg-foreground/[0.02]">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-muted-foreground">
                    Template: <span className="font-medium text-foreground">{activeTemplate?.name ?? "—"}</span>
                  </span>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as any)}
                    className="h-7 px-2 text-xs border border-foreground/15 rounded-md bg-background"
                  >
                    <option value="email">Email</option>
                    <option value="linkedin">LinkedIn DM</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-[11px]">
                    <input type="checkbox" checked={personalize} onChange={(e) => setPersonalize(e.target.checked)} />
                    AI personalize
                  </label>
                  <button
                    onClick={bulkDraft}
                    disabled={drafting || !activeTemplate || members.length === 0}
                    className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-foreground text-background text-xs hover:bg-foreground/90 disabled:opacity-50"
                  >
                    {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Draft {selected.size ? `${selected.size} selected` : `all (${members.length})`}
                  </button>
                </div>
                {error && (
                  <div className="mt-2 flex items-start gap-2 text-[11px] text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
                  </div>
                )}
                {draftResult && (
                  <div className="mt-2 text-[11px] text-emerald-700">
                    Drafted {draftResult.drafted} members{draftResult.provider ? ` via ${draftResult.provider}` : ""}.
                  </div>
                )}
              </div>

              {/* Members table */}
              <div className="overflow-auto border border-foreground/15 rounded-md">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 bg-foreground/[0.04] z-10">
                    <tr className="border-b border-foreground/15">
                      <th className="w-8 px-2 py-2 border-r border-foreground/10">
                        <input type="checkbox" checked={allChecked} onChange={() => toggleSelectAll(allVisibleIds)} aria-label="select all"/>
                      </th>
                      <th className="text-left px-2 py-2 border-r border-foreground/10 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Investor</th>
                      <th className="text-left px-2 py-2 border-r border-foreground/10 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Type</th>
                      <th className="text-left px-2 py-2 border-r border-foreground/10 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Score</th>
                      <th className="text-left px-2 py-2 border-r border-foreground/10 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Research</th>
                      <th className="text-left px-2 py-2 border-r border-foreground/10 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Contact</th>
                      <th className="text-left px-2 py-2 border-r border-foreground/10 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="text-left px-2 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingMembers ? (
                      <tr><td colSpan={8} className="text-center text-muted-foreground py-8"><Loader2 className="w-4 h-4 mx-auto animate-spin"/></td></tr>
                    ) : visibleMembers.length === 0 ? (
                      <tr><td colSpan={8} className="text-center text-muted-foreground py-8">No members. Bulk-add from the CRM with "Send selected to Outreach".</td></tr>
                    ) : visibleMembers.map((m, i) => (
                      <tr key={m.id} className={`border-b border-foreground/[0.06] hover:bg-foreground/[0.03] ${i % 2 ? "bg-foreground/[0.015]" : ""} ${selected.has(m.id) ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}>
                        <td className="px-2 py-2 border-r border-foreground/[0.06] align-top">
                          <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)} />
                        </td>
                        <td className="px-2 py-2 border-r border-foreground/[0.06] align-top">
                          <div className="font-medium">{m.displayName}</div>
                          {m.displayTitle && <div className="text-[10px] text-muted-foreground">{m.displayTitle}</div>}
                          {m.displayLocation && <div className="text-[10px] font-mono text-muted-foreground/80">{m.displayLocation}</div>}
                        </td>
                        <td className="px-2 py-2 border-r border-foreground/[0.06] align-top font-mono text-[10px]">{m.displayType ?? "—"}</td>
                        <td className="px-2 py-2 border-r border-foreground/[0.06] align-top font-mono">{m.displayScore ?? "—"}{m.displayTier ? <div className="text-[10px] text-muted-foreground">{m.displayTier}</div> : null}</td>
                        <td className="px-2 py-2 border-r border-foreground/[0.06] align-top max-w-[260px]">
                          {m.researchSummary ? (
                            <div className="text-[11px] leading-relaxed line-clamp-3">{m.researchSummary}</div>
                          ) : m.whyMatch ? (
                            <div className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2 italic">{m.whyMatch}</div>
                          ) : (
                            <span className="text-muted-foreground/40 text-[11px]">— no research</span>
                          )}
                        </td>
                        <td className="px-2 py-2 border-r border-foreground/[0.06] align-top text-[10px] font-mono">
                          {m.displayEmail && <div className="flex items-center gap-1 text-foreground"><Mail className="w-3 h-3 text-muted-foreground" /> {m.displayEmail}</div>}
                          {m.displayLinkedin && <a href={m.displayLinkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline"><Linkedin className="w-3 h-3 text-muted-foreground" /> profile</a>}
                          {!m.displayEmail && !m.displayLinkedin && <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-2 py-2 border-r border-foreground/[0.06] align-top">
                          <select
                            value={m.status}
                            onChange={(e) => setMemberStatus(m, e.target.value as any)}
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border-0 ${STATUS_COLOR[m.status]}`}
                          >
                            {(["planned", "drafted", "sent", "skipped", "replied"] as const).map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2 align-top">
                          <button onClick={() => removeMember(m)} className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 p-1 rounded"><Trash2 className="w-3 h-3"/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* ── Template library right ── */}
        <aside className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">Templates</h2>
            <button
              onClick={() => setShowTemplateForm((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>

          {showTemplateForm && (
            <NewTemplateForm
              onSaved={async () => { setShowTemplateForm(false); await reloadTemplates() }}
              onCancel={() => setShowTemplateForm(false)}
            />
          )}

          <TemplateList
            templates={allTemplates}
            categories={templates.categories}
            activeId={activeTemplateId}
            onPick={setActiveTemplateId}
            onDeleted={reloadTemplates}
          />

          {activeTemplate && (
            <div className="border border-foreground/15 rounded-md p-3 text-[11px] space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Preview</div>
              {activeTemplate.subject && (
                <div><span className="font-mono text-muted-foreground">Subject:</span> {activeTemplate.subject}</div>
              )}
              <div className="whitespace-pre-wrap leading-relaxed">{activeTemplate.body}</div>
              {activeTemplate.variables.length > 0 && (
                <div className="font-mono text-[10px] text-muted-foreground pt-2 border-t border-foreground/10">
                  vars: {activeTemplate.variables.join(", ")}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────

function TemplateList({
  templates, categories, activeId, onPick, onDeleted,
}: {
  templates: TemplateRow[]
  categories: string[]
  activeId: string
  onPick: (id: string) => void
  onDeleted: () => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(categories.slice(0, 3)))
  const byCat = useMemo(() => {
    const m: Record<string, TemplateRow[]> = {}
    for (const t of templates) (m[t.category] ?? (m[t.category] = [])).push(t)
    return m
  }, [templates])
  function toggle(cat: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })
  }
  async function deleteUserTemplate(id: string) {
    if (!confirm("Delete this template?")) return
    await fetch(`/api/outreach/templates/${id}`, { method: "DELETE" }).catch(() => {})
    onDeleted()
  }
  const cats = Object.keys(byCat)
  return (
    <div className="space-y-1.5">
      {cats.map((cat) => (
        <div key={cat} className="border border-foreground/10 rounded-md">
          <button
            onClick={() => toggle(cat)}
            className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:bg-foreground/[0.03]"
          >
            <span>{cat} <span className="text-foreground/40">{byCat[cat].length}</span></span>
            {expanded.has(cat) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {expanded.has(cat) && (
            <div className="border-t border-foreground/10">
              {byCat[cat].map((t) => (
                <div key={t.id} className={`flex items-center gap-1 px-2 py-1.5 text-xs border-b border-foreground/[0.05] last:border-b-0 cursor-pointer ${activeId === t.id ? "bg-foreground text-background" : "hover:bg-foreground/[0.03]"}`}
                     onClick={() => onPick(t.id)}>
                  {t.channel === "linkedin" ? <Linkedin className={`w-3 h-3 ${activeId === t.id ? "" : "text-muted-foreground"}`} /> : <Mail className={`w-3 h-3 ${activeId === t.id ? "" : "text-muted-foreground"}`} />}
                  <span className="truncate flex-1">{t.name}</span>
                  {!t.builtin && (
                    <>
                      {t.isDefault && <Star className={`w-3 h-3 ${activeId === t.id ? "text-background" : "text-amber-500"}`} />}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteUserTemplate(t.id) }}
                        className={`p-0.5 ${activeId === t.id ? "hover:text-rose-300" : "hover:text-rose-600"}`}
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function NewTemplateForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState("")
  const [category, setCategory] = useState("custom")
  const [channel, setChannel] = useState<"email" | "linkedin">("email")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!name.trim() || !body.trim()) { setErr("Name + body required"); return }
    setBusy(true); setErr(null)
    try {
      const res = await fetch("/api/outreach/templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), category, channel,
          subject: channel === "email" ? subject : undefined,
          body,
        }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d?.error ?? "Save failed"); return }
      onSaved()
    } catch (e: any) { setErr(e?.message ?? "Save failed") }
    finally { setBusy(false) }
  }

  return (
    <div className="border border-foreground/15 rounded-md p-3 space-y-2 text-xs">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">New template</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-full px-2 py-1.5 border border-foreground/15 rounded-md bg-background" />
      <div className="flex gap-2">
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="category" className="flex-1 px-2 py-1.5 border border-foreground/15 rounded-md bg-background font-mono" />
        <select value={channel} onChange={(e) => setChannel(e.target.value as any)} className="px-2 py-1.5 border border-foreground/15 rounded-md bg-background">
          <option value="email">Email</option>
          <option value="linkedin">LinkedIn</option>
        </select>
      </div>
      {channel === "email" && (
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (vars: {{firstName}}, {{firmName}}, …)" className="w-full px-2 py-1.5 border border-foreground/15 rounded-md bg-background" />
      )}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Body — use {{firstName}}, {{companyName}}, {{oneLiner}}, {{traction}}, {{calendarUrl}}…" className="w-full px-2 py-1.5 border border-foreground/15 rounded-md bg-background leading-relaxed" />
      {err && <div className="text-rose-600 text-[11px]">{err}</div>}
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-2 py-1 hover:bg-foreground/5 rounded">Cancel</button>
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-foreground text-background disabled:opacity-50">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
        </button>
      </div>
    </div>
  )
}

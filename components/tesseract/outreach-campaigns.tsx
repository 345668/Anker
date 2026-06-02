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

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  Plus, Loader2, Sparkles, Mail, Linkedin, Trash2, Pencil, Check, X,
  Search, ChevronDown, ChevronRight, Send, Copy, Save, AlertTriangle,
  Inbox, MessageSquare, Star, Eye, ExternalLink, RefreshCw, ArrowRight,
  CheckCircle2, XCircle, RotateCcw,
} from "lucide-react"
import { FounderContextCard, useFounderContext } from "./founder-context-card"
import { AiStatusBadge, type AiProvider } from "./ai-status-badge"

interface OutreachMessage {
  id: string
  kind: string
  channel: "email" | "linkedin" | string
  subject: string | null
  body: string | null
  status: string
  sentAt: string | null
  emailTo: string | null
  createdAt: string | null
}

interface CampaignSummary {
  id: string
  name: string
  description: string | null
  status: "draft" | "active" | "paused" | "done"
  defaultChannel: "email" | "linkedin" | "multi"
  defaultTemplateId: string | null
  ccEmails: string[]
  bccEmails: string[]
  folkLoggingEnabled: boolean
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
  // Curate-campaign panel state (port of the SVS one-off scripts).
  const [curateOpen, setCurateOpen] = useState(false)
  const [curateRunning, setCurateRunning] = useState(false)
  const [importingDrafts, setImportingDrafts] = useState(false)
  const [importResult, setImportResult] = useState<{ emailUpserts: number; dmUpserts: number; unmatched: number; skippedLocked: number } | null>(null)
  const importDraftsFileRef = useRef<HTMLInputElement | null>(null)
  const [curateResult, setCurateResult] = useState<{ crawled: number; ok: number; fail: number; no_domain: number; drafted: number; breakdown: Record<string, number> } | null>(null)
  const [tier1Deep, setTier1Deep] = useState(30)
  const [tier2Light, setTier2Light] = useState(100)
  const [regenDrafts, setRegenDrafts] = useState(true)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState("")
  const [showTemplateForm, setShowTemplateForm] = useState(false)

  // ── Draft panel state ────────────────────────────────────────────────
  // The slide-out panel that shows a member's drafted messages + send controls.
  const [panelMember, setPanelMember] = useState<MemberRow | null>(null)
  const [panelMessages, setPanelMessages] = useState<OutreachMessage[]>([])
  const [panelLoading, setPanelLoading] = useState(false)
  const [panelEditBody, setPanelEditBody] = useState<Record<string, string>>({})
  const [panelEditSubject, setPanelEditSubject] = useState<Record<string, string>>({})
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null)
  // Bulk send state
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkSendResult, setBulkSendResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null)
  // Follow-up generation
  const [followUpId, setFollowUpId] = useState<string | null>(null)
  const [followUpLoading, setFollowUpLoading] = useState(false)

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
  // ─── import pre-curated drafts from an xlsx ───
  async function onImportDraftsFile(file: File) {
    if (!activeCampaign) return
    setImportingDrafts(true); setError(null); setImportResult(null)
    try {
      const fd = new FormData()
      fd.append("xlsx", file)
      const res = await fetch(`/api/outreach/campaigns/${activeCampaign.id}/import-drafts`, {
        method: "POST",
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error ?? "Import failed"); return }
      setImportResult({
        emailUpserts: data.imported?.emailUpserts ?? 0,
        dmUpserts: data.imported?.dmUpserts ?? 0,
        unmatched: (data.unmatched ?? []).length,
        skippedLocked: data.skippedLocked ?? 0,
      })
      // Refresh members + drafts so the UI reflects the new state.
      await loadMembers(activeCampaign.id)
      await reloadCampaigns()
    } catch (e: any) { setError(e?.message ?? "Import failed") }
    finally { setImportingDrafts(false) }
  }

  // ─── curate campaign (crawl + per-LP-type messages + downloadable workbook) ───
  async function runCurate() {
    if (!activeId) return
    setCurateRunning(true); setError(null); setCurateResult(null)
    try {
      const senderInput = {
        founderName: founder.founderName,
        companyName: founder.companyName,
        oneLiner: founder.oneLiner,
        facts: founder.facts,
        calendarUrl: founder.calendarUrl,
      }
      const res = await fetch(`/api/outreach/campaigns/${activeId}/curate-run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier1Deep, tier2Light,
          regenerateDrafts: regenDrafts,
          sender: senderInput,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error ?? "Curate failed"); return }
      setCurateResult({
        crawled: (data.crawl?.ok ?? 0) + (data.crawl?.fail ?? 0),
        ok: data.crawl?.ok ?? 0,
        fail: data.crawl?.fail ?? 0,
        no_domain: data.crawl?.no_domain ?? 0,
        drafted: data.drafted ?? 0,
        breakdown: data.breakdown ?? {},
      })
      await loadMembers(activeId)
      await reloadCampaigns()
    } catch (e: any) { setError(e?.message ?? "Curate failed") }
    finally { setCurateRunning(false) }
  }
  function exportCurated(format: "xlsx" | "docx") {
    if (!activeId) return
    const u = `/api/outreach/campaigns/${activeId}/export-curated?format=${format}&tier1Deep=${tier1Deep}&tier2Light=${tier2Light}`
    // Trigger a download via an anchor click — keeps the binary stream
    // out of the JS heap.
    const a = document.createElement("a")
    a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer"
    document.body.appendChild(a); a.click(); a.remove()
  }

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

  // ── Generate draft for a single member (used from the panel's empty state) ──
  const [generatingOne, setGeneratingOne] = useState(false)
  async function generateForOne(m: MemberRow) {
    if (!activeCampaign) return
    setGeneratingOne(true)
    setError(null)
    try {
      const res = await fetch(`/api/outreach/campaigns/${activeCampaign.id}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds: [m.id],
          templateId: activeTemplate?.id ?? undefined,
          founder,
          channel,
          personalize,
          provider: aiOverride === "auto" ? undefined : aiOverride,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error ?? "Generate failed"); return }
      await openDraftPanel(m)
      // Bump member status locally so the row reflects "drafted"
      setMembers((prev) => prev.map((x) => x.id === m.id ? { ...x, status: "drafted" } : x))
    } catch (e: any) { setError(e?.message ?? "Generate failed") }
    finally { setGeneratingOne(false) }
  }

  // ── Open draft panel for a member ────────────────────────────────────
  async function openDraftPanel(m: MemberRow) {
    setPanelMember(m)
    setPanelMessages([])
    setPanelLoading(true)
    setSendResult(null)
    setPanelEditBody({})
    setPanelEditSubject({})
    try {
      const res = await fetch(`/api/outreach/messages?crmEntryId=${m.crmEntryId}`)
      if (!res.ok) { setPanelLoading(false); return }
      const data = await res.json()
      const msgs: OutreachMessage[] = (data?.messages ?? []).map((r: any) => ({
        id: r.id,
        kind: r.kind,
        channel: r.channel,
        subject: r.subject ?? null,
        body: r.body ?? null,
        status: r.status,
        sentAt: r.sent_at ?? null,
        emailTo: r.email_to ?? null,
        createdAt: r.created_at ?? null,
      }))
      setPanelMessages(msgs)
      // Seed edit state with current body/subject
      const bodyMap: Record<string, string> = {}
      const subjMap: Record<string, string> = {}
      for (const msg of msgs) {
        bodyMap[msg.id] = msg.body ?? ""
        subjMap[msg.id] = msg.subject ?? ""
      }
      setPanelEditBody(bodyMap)
      setPanelEditSubject(subjMap)
    } catch { /* swallow */ }
    finally { setPanelLoading(false) }
  }

  // ── Save edits to a message ───────────────────────────────────────────
  async function saveMessageEdit(msgId: string) {
    const body = panelEditBody[msgId]
    const subject = panelEditSubject[msgId]
    try {
      await fetch(`/api/outreach/messages/${msgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, subject }),
      })
      setPanelMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, body: body ?? m.body, subject: subject ?? m.subject } : m))
    } catch { /* swallow */ }
  }

  // ── Send one message ──────────────────────────────────────────────────
  async function sendMessage(msgId: string, name: string) {
    if (!confirm(`Send this email to ${name}? This will dispatch via Resend immediately.`)) return
    setSendingId(msgId)
    setSendResult(null)
    // Save any edits first
    await saveMessageEdit(msgId)
    try {
      const res = await fetch("/api/outreach/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msgId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setSendResult({ id: msgId, ok: false, msg: data?.error ?? "Send failed" })
      } else {
        setSendResult({ id: msgId, ok: true, msg: data.dryRun ? "Sent (dry-run — no RESEND_API_KEY)" : "Sent via Resend" })
        // Refresh messages + member status
        if (panelMember) {
          await openDraftPanel(panelMember)
          setMembers((prev) => prev.map((m) => m.id === panelMember.id ? { ...m, status: "sent" } : m))
        }
      }
    } catch (e: any) {
      setSendResult({ id: msgId, ok: false, msg: e?.message ?? "Send failed" })
    } finally { setSendingId(null) }
  }

  // ── Bulk send selected/all drafted members ────────────────────────────
  async function bulkSendSelected() {
    const draftedIds = [...selected].filter((id) => {
      const m = members.find((x) => x.id === id)
      return m?.status === "drafted" || m?.status === "planned"
    })
    const targets = draftedIds.length ? draftedIds : members.filter((m) => m.status === "drafted").map((m) => m.id)
    if (!targets.length) { setError("No drafted members to send. Run Draft first."); return }
    if (!confirm(`Send emails to ${targets.length} member${targets.length !== 1 ? "s" : ""}? This will dispatch via Resend immediately.`)) return
    setBulkSending(true)
    setBulkSendResult(null)
    setError(null)
    try {
      const res = await fetch(`/api/outreach/campaigns/${activeId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: targets }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error ?? "Bulk send failed"); return }
      setBulkSendResult({ sent: data.sent ?? 0, failed: data.failed ?? 0, skipped: data.skipped ?? 0 })
      await loadMembers(activeId)
      await reloadCampaigns()
    } catch (e: any) { setError(e?.message ?? "Bulk send failed") }
    finally { setBulkSending(false) }
  }

  // ── Generate follow-up for a member ──────────────────────────────────
  async function generateFollowUp(msgId: string, m: MemberRow) {
    setFollowUpId(msgId)
    setFollowUpLoading(true)
    try {
      const res = await fetch("/api/outreach/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "follow_up",
          investorName: m.displayName,
          firmName: m.displayTitle ?? "",
          stage: m.crmStage ?? "contacted",
          threadSubject: panelMessages.find((x) => x.kind === "connection_request")?.subject ?? undefined,
          priorThread: panelMessages.find((x) => x.kind === "connection_request")?.body ?? undefined,
          founderName: founder.founderName,
          companyName: founder.companyName,
          oneLiner: founder.oneLiner,
          facts: founder.facts,
          calendarUrl: founder.calendarUrl,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.subject) {
        // Upsert a follow-up message row and add it to the panel
        const newMsg: OutreachMessage = {
          id: data.messageId ?? `local-${Date.now()}`,
          kind: "follow_up",
          channel: "email",
          subject: data.subject,
          body: data.body,
          status: "draft",
          sentAt: null,
          emailTo: m.displayEmail,
          createdAt: new Date().toISOString(),
        }
        setPanelMessages((prev) => [...prev, newMsg])
        setPanelEditBody((prev) => ({ ...prev, [newMsg.id]: data.body ?? "" }))
        setPanelEditSubject((prev) => ({ ...prev, [newMsg.id]: data.subject ?? "" }))
      } else {
        setError(data?.error ?? "Follow-up generation failed")
      }
    } catch (e: any) { setError(e?.message ?? "Follow-up generation failed") }
    finally { setFollowUpLoading(false); setFollowUpId(null) }
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

              {/* CC / BCC settings — applied to every send for this campaign */}
              <CampaignCcBccEditor
                campaign={activeCampaign}
                onSaved={(cc, bcc) =>
                  setCampaigns((prev) =>
                    prev.map((x) => (x.id === activeCampaign.id ? { ...x, ccEmails: cc, bccEmails: bcc } : x)),
                  )
                }
              />

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
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={bulkDraft}
                      disabled={drafting || !activeTemplate || members.length === 0}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-foreground text-background text-xs hover:bg-foreground/90 disabled:opacity-50"
                    >
                      {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Draft {selected.size ? `${selected.size} selected` : `all (${members.length})`}
                    </button>
                    <button
                      onClick={bulkSendSelected}
                      disabled={bulkSending || members.filter((m) => m.status === "drafted").length === 0}
                      title="Send drafted emails via Resend (human-gated — you confirm before sending)"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-700 text-white text-xs hover:bg-emerald-800 disabled:opacity-40"
                    >
                      {bulkSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Send {selected.size
                        ? `${[...selected].filter((id) => members.find((m) => m.id === id)?.status === "drafted").length} drafted`
                        : `all drafted (${members.filter((m) => m.status === "drafted").length})`}
                    </button>
                  </div>
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
                {bulkSendResult && (
                  <div className={`mt-2 text-[11px] flex items-center gap-1.5 ${bulkSendResult.failed > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                    {bulkSendResult.failed > 0 ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Sent {bulkSendResult.sent}
                    {bulkSendResult.failed > 0 && ` · ${bulkSendResult.failed} failed`}
                    {bulkSendResult.skipped > 0 && ` · ${bulkSendResult.skipped} skipped (no draft)`}
                  </div>
                )}
              </div>

              {/* ── Curate this campaign (port of the SVS one-off scripts) ── */}
              <div className="border border-foreground/15 rounded-md bg-foreground/[0.02]">
                <button
                  type="button"
                  onClick={() => setCurateOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Sparkles className="w-3.5 h-3.5" /> Curate this campaign
                  </span>
                  <span className="text-muted-foreground">
                    {curateOpen ? "hide" : "show"}
                  </span>
                </button>
                {curateOpen && (
                  <div className="p-3 border-t border-foreground/10 space-y-3 text-xs">
                    <p className="text-muted-foreground leading-relaxed">
                      Tiered web-crawl across this campaign{"'"}s members{": "}top-N firms get a deep crawl
                      (landing + /about /team /contact /portfolio /investment /thesis /approach /strategy);
                      next-N get a single landing-page pull; the rest stay metadata-only.  Results land on
                      each CRM row{"'"}s research summary.  Optionally re-renders first-touch drafts (email + LinkedIn DM)
                      per LP-type voice rules. Downloads a 6-sheet curated workbook + campaign brief DOCX.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1.5">
                        Top
                        <input
                          type="number" min={0} max={100} value={tier1Deep}
                          onChange={(e) => setTier1Deep(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                          className="w-14 h-7 px-1 text-xs border border-foreground/15 rounded bg-background"
                        />
                        deep
                      </label>
                      <label className="flex items-center gap-1.5">
                        next
                        <input
                          type="number" min={0} max={200} value={tier2Light}
                          onChange={(e) => setTier2Light(Math.max(0, Math.min(200, Number(e.target.value) || 0)))}
                          className="w-14 h-7 px-1 text-xs border border-foreground/15 rounded bg-background"
                        />
                        light
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={regenDrafts} onChange={(e) => setRegenDrafts(e.target.checked)} />
                        re-render drafts (per LP-type voice)
                      </label>
                      <button
                        onClick={runCurate}
                        disabled={curateRunning || members.length === 0}
                        className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-foreground text-background text-xs hover:bg-foreground/90 disabled:opacity-50"
                      >
                        {curateRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {curateRunning ? "Curating…" : "Run curate"}
                      </button>
                    </div>
                    {importResult && (
                      <div className="text-[11px] leading-relaxed text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900 rounded p-2">
                        Imported {importResult.emailUpserts} email draft(s) + {importResult.dmUpserts} LinkedIn DM(s).
                        {importResult.skippedLocked > 0 && ` Skipped ${importResult.skippedLocked} already-sent/replied row(s).`}
                        {importResult.unmatched > 0 && ` ${importResult.unmatched} row(s) couldn't be matched (check exact names or LinkedIn URLs).`}
                      </div>
                    )}
                    {curateResult && (
                      <div className="text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900 rounded p-2">
                        Crawled {curateResult.crawled} sites (ok {curateResult.ok} / fail {curateResult.fail} / no domain {curateResult.no_domain}).
                        Drafts re-rendered for {curateResult.drafted} members.
                        Breakdown — family offices {curateResult.breakdown.family_office ?? 0}, angels {curateResult.breakdown.angel ?? 0},
                        institutional {curateResult.breakdown.institutional ?? 0}, hedge {curateResult.breakdown.hedge ?? 0}, other {curateResult.breakdown.other ?? 0}.
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button onClick={() => exportCurated("xlsx")} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-foreground/15 hover:bg-foreground/5">
                        <Mail className="w-3 h-3" /> Download curated workbook (.xlsx)
                      </button>
                      <input
                        ref={importDraftsFileRef}
                        type="file"
                        accept=".xlsx"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) void onImportDraftsFile(f)
                          e.target.value = ""
                        }}
                      />
                      <button
                        onClick={() => importDraftsFileRef.current?.click()}
                        disabled={importingDrafts}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        title="Upload an xlsx whose Email Drafts + LinkedIn DMs sheets you want to apply to this campaign"
                      >
                        {importingDrafts ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                        Import drafts from .xlsx
                      </button>
                      <button onClick={() => exportCurated("docx")} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-foreground/15 hover:bg-foreground/5">
                        <MessageSquare className="w-3 h-3" /> Download campaign brief (.docx)
                      </button>
                    </div>
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
                            <div
                              className="text-[11px] leading-relaxed line-clamp-2 cursor-pointer"
                              title={m.researchSummary}
                              onClick={() => openDraftPanel(m)}
                            >{m.researchSummary}</div>
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
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openDraftPanel(m)}
                              title="Open draft / send"
                              className="text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 p-1 rounded"
                            >
                              <Eye className="w-3 h-3" />
                            </button>
                            {m.displayEmail && (
                              <button
                                onClick={async () => { await openDraftPanel(m); /* drawer's Send button takes over */ }}
                                title="Open + send via Resend"
                                className="text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 p-1 rounded"
                              >
                                <Send className="w-3 h-3" />
                              </button>
                            )}
                            <button onClick={() => removeMember(m)} className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 p-1 rounded"><Trash2 className="w-3 h-3"/></button>
                          </div>
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

      {/* ── Member Draft Panel (slide-out) ── */}
      {panelMember && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={() => { setPanelMember(null); setSendResult(null) }}
          />
          {/* Panel */}
          <div className="relative z-10 w-full max-w-xl bg-background border-l border-foreground/15 shadow-2xl flex flex-col h-full overflow-hidden">
            {/* Panel header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-foreground/15 shrink-0">
              <div>
                <div className="font-display text-base">{panelMember.displayName}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {panelMember.displayTitle ?? ""}{panelMember.displayEmail ? ` · ${panelMember.displayEmail}` : ""}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${STATUS_COLOR[panelMember.status] ?? "bg-foreground/10"}`}>
                    {panelMember.status}
                  </span>
                  {panelMember.displayScore && (
                    <span className="text-[10px] font-mono text-muted-foreground">score {panelMember.displayScore}</span>
                  )}
                  {panelMember.displayLinkedin && (
                    <a href={panelMember.displayLinkedin} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline">
                      <Linkedin className="w-3 h-3" /> LinkedIn
                    </a>
                  )}
                </div>
              </div>
              <button onClick={() => { setPanelMember(null); setSendResult(null) }} className="p-1.5 rounded hover:bg-foreground/10">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Research summary */}
            {panelMember.researchSummary && (
              <div className="px-5 py-3 border-b border-foreground/10 bg-foreground/[0.02]">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Research</div>
                <p className="text-xs leading-relaxed text-foreground/80">{panelMember.researchSummary}</p>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {panelLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : panelMessages.length === 0 ? (
                <div className="border border-dashed border-foreground/20 rounded-md p-6 text-center text-sm text-muted-foreground space-y-3">
                  <Inbox className="w-6 h-6 mx-auto opacity-30" />
                  <div>No drafted messages yet for this investor.</div>
                  <button
                    onClick={() => panelMember && generateForOne(panelMember)}
                    disabled={generatingOne}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-xs hover:bg-foreground/90 disabled:opacity-50"
                  >
                    {generatingOne ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Generate draft now
                  </button>
                </div>
              ) : panelMessages.map((msg) => (
                <div key={msg.id} className="border border-foreground/15 rounded-md overflow-hidden">
                  {/* Message header */}
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-foreground/[0.03] border-b border-foreground/10">
                    <div className="flex items-center gap-2">
                      {msg.channel === "linkedin"
                        ? <Linkedin className="w-3.5 h-3.5 text-blue-600" />
                        : <Mail className="w-3.5 h-3.5 text-muted-foreground" />}
                      <span className="text-[11px] font-mono capitalize">{msg.kind?.replace(/_/g, " ")}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        msg.status === "sent" || msg.status === "delivered"
                          ? "bg-emerald-100 text-emerald-700"
                          : msg.status === "draft"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-foreground/10"
                      }`}>{msg.status}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Copy body */}
                      <button
                        onClick={() => navigator.clipboard.writeText(
                          msg.channel === "linkedin" ? (panelEditBody[msg.id] ?? msg.body ?? "") : (panelEditBody[msg.id] ?? msg.body ?? "")
                        )}
                        className="p-1 rounded hover:bg-foreground/10 text-muted-foreground"
                        title="Copy body"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      {/* Save edits */}
                      {(panelEditBody[msg.id] !== msg.body || panelEditSubject[msg.id] !== msg.subject) && msg.status !== "sent" && msg.status !== "delivered" && (
                        <button
                          onClick={() => saveMessageEdit(msg.id)}
                          className="p-1 rounded hover:bg-foreground/10 text-emerald-600"
                          title="Save edits"
                        >
                          <Save className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Subject (email only) */}
                  {msg.channel === "email" && (
                    <div className="px-3 py-2 border-b border-foreground/[0.06] bg-foreground/[0.015]">
                      <div className="text-[10px] font-mono text-muted-foreground mb-0.5">Subject</div>
                      <input
                        value={panelEditSubject[msg.id] ?? msg.subject ?? ""}
                        onChange={(e) => setPanelEditSubject((prev) => ({ ...prev, [msg.id]: e.target.value }))}
                        disabled={msg.status === "sent" || msg.status === "delivered"}
                        className="w-full text-xs bg-transparent focus:outline-none disabled:opacity-60"
                      />
                    </div>
                  )}

                  {/* Body */}
                  <div className="px-3 py-2">
                    <div className="text-[10px] font-mono text-muted-foreground mb-1">
                      {msg.channel === "linkedin" ? `DM (${(panelEditBody[msg.id] ?? msg.body ?? "").length} chars)` : "Body"}
                    </div>
                    <textarea
                      value={panelEditBody[msg.id] ?? msg.body ?? ""}
                      onChange={(e) => setPanelEditBody((prev) => ({ ...prev, [msg.id]: e.target.value }))}
                      disabled={msg.status === "sent" || msg.status === "delivered"}
                      rows={msg.channel === "linkedin" ? 5 : 10}
                      className="w-full text-xs font-sans leading-relaxed bg-transparent resize-none focus:outline-none disabled:opacity-60"
                    />
                  </div>

                  {/* Sent info */}
                  {msg.sentAt && (
                    <div className="px-3 py-1.5 border-t border-foreground/[0.06] text-[10px] font-mono text-muted-foreground bg-emerald-50/50 dark:bg-emerald-950/20">
                      Sent {new Date(msg.sentAt).toLocaleString()} → {msg.emailTo ?? panelMember.displayEmail}
                    </div>
                  )}

                  {/* Send result for this message */}
                  {sendResult?.id === msg.id && (
                    <div className={`px-3 py-1.5 border-t border-foreground/[0.06] text-[11px] flex items-center gap-1.5 ${sendResult.ok ? "text-emerald-700 bg-emerald-50/60" : "text-rose-600 bg-rose-50/60"}`}>
                      {sendResult.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {sendResult.msg}
                    </div>
                  )}

                  {/* Actions */}
                  {msg.status !== "sent" && msg.status !== "delivered" && msg.status !== "cancelled" && (
                    <div className="px-3 py-2 border-t border-foreground/10 flex items-center gap-2">
                      {msg.channel === "email" && panelMember.displayEmail && (
                        <button
                          onClick={() => sendMessage(msg.id, panelMember.displayName)}
                          disabled={sendingId === msg.id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-700 text-white text-xs hover:bg-emerald-800 disabled:opacity-50"
                        >
                          {sendingId === msg.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Send className="w-3.5 h-3.5" />}
                          Send via Resend
                        </button>
                      )}
                      {msg.channel === "linkedin" && panelMember.displayLinkedin && (
                        <a
                          href={panelMember.displayLinkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700"
                        >
                          <Linkedin className="w-3.5 h-3.5" /> Open LinkedIn profile
                        </a>
                      )}
                      {msg.kind === "connection_request" && (
                        <button
                          onClick={() => generateFollowUp(msg.id, panelMember)}
                          disabled={followUpLoading}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-foreground/20 text-xs hover:bg-foreground/5 disabled:opacity-50"
                        >
                          {followUpLoading && followUpId === msg.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <RefreshCw className="w-3.5 h-3.5" />}
                          Generate follow-up
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Generate follow-up from scratch (no prior messages) */}
              {panelMessages.length > 0 && !panelMessages.some((m) => m.kind === "follow_up") && (
                <button
                  onClick={() => {
                    const first = panelMessages[0]
                    if (first) generateFollowUp(first.id, panelMember)
                  }}
                  disabled={followUpLoading}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-foreground/20 text-xs text-muted-foreground hover:bg-foreground/5 disabled:opacity-50"
                >
                  {followUpLoading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5" />}
                  Generate follow-up email
                </button>
              )}
            </div>
          </div>
        </div>
      )}
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


// ─── CC / BCC editor for the active campaign ────────────────────────────────
// Mounted below the campaign header.  Persists via PATCH /api/outreach/campaigns/:id.
// Empty arrays clear the setting (no auto-CC).
function CampaignCcBccEditor({
  campaign,
  onSaved,
}: {
  campaign: CampaignSummary
  onSaved: (cc: string[], bcc: string[]) => void
}) {
  const [cc, setCc]   = useState<string>((campaign.ccEmails  ?? []).join(", "))
  const [bcc, setBcc] = useState<string>((campaign.bccEmails ?? []).join(", "))
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  // re-sync when the active campaign changes
  useEffect(() => {
    setCc((campaign.ccEmails  ?? []).join(", "))
    setBcc((campaign.bccEmails ?? []).join(", "))
  }, [campaign.id, campaign.ccEmails?.join(","), campaign.bccEmails?.join(",")])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ccEmails: cc, bccEmails: bcc }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data?.error ?? "Failed to save CC/BCC")
        return
      }
      const c = data?.campaign ?? {}
      onSaved(c.ccEmails ?? [], c.bccEmails ?? [])
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }
  const ccHasContent  = cc.trim().length > 0
  const bccHasContent = bcc.trim().length > 0

  return (
    <div className="border border-foreground/15 rounded-md p-3 bg-foreground/[0.02] text-xs space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-medium text-muted-foreground">
          Auto-CC / BCC every send for this campaign
        </div>
        <div className="flex items-center gap-2">
          {savedAt && Date.now() - savedAt < 3000 && (
            <span className="text-emerald-600 font-mono">saved</span>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="px-2 py-1 rounded font-mono bg-foreground text-background disabled:opacity-50"
          >
            {saving ? "saving…" : "save"}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground font-mono uppercase tracking-wider text-[10px]">CC (visible to recipient)</span>
          <input
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="colleague@example.com, partner@example.com"
            className={`w-full px-2 py-1.5 border rounded-md bg-background ${ccHasContent ? "border-foreground/30" : "border-foreground/15"}`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground font-mono uppercase tracking-wider text-[10px]">BCC (hidden from recipient)</span>
          <input
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
            placeholder="sally@example.com"
            className={`w-full px-2 py-1.5 border rounded-md bg-background ${bccHasContent ? "border-foreground/30" : "border-foreground/15"}`}
          />
        </label>
      </div>
      <div className="text-[10px] text-muted-foreground leading-snug">
        Multiple addresses separated by commas, semicolons, or new lines. Applies to every email sent from this
        campaign — both the bulk Send All flow and the per-row Send button.
      </div>
      <FolkLoggingToggle
        campaign={campaign}
        onSaved={(enabled) =>
          onSaved(
            campaign.ccEmails ?? [],
            campaign.bccEmails ?? [],
          )
        }
      />
    </div>
  )
}

// ─── Folk logging toggle ───────────────────────────────────────────────────
// PATCHes outreach_campaigns.folk_logging_enabled.  When on, every Resend send
// from this campaign also POSTs to Folk /v1/interactions so it shows up on the
// contact's timeline.  Failures are silent — the send doesn't roll back.
function FolkLoggingToggle({
  campaign,
  onSaved,
}: {
  campaign: CampaignSummary
  onSaved: (enabled: boolean) => void
}) {
  const [enabled, setEnabled] = useState<boolean>(!!campaign.folkLoggingEnabled)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setEnabled(!!campaign.folkLoggingEnabled) }, [campaign.id, campaign.folkLoggingEnabled])

  async function toggle(next: boolean) {
    setEnabled(next)
    setSaving(true)
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folkLoggingEnabled: next }),
      })
      if (!res.ok) {
        // revert on failure
        setEnabled(!next)
        const data = await res.json().catch(() => ({}))
        alert(data?.error ?? "Failed to update Folk logging setting")
        return
      }
      onSaved(next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer select-none pt-1">
      <input
        type="checkbox"
        checked={enabled}
        disabled={saving}
        onChange={(e) => toggle(e.target.checked)}
        className="w-3.5 h-3.5"
      />
      <span className="font-mono uppercase tracking-wider text-[10px] text-muted-foreground">
        Log every send to Folk CRM
      </span>
      <span className="text-muted-foreground/70 text-[10px]">
        — POSTs /v1/interactions on each successful Resend send (best-effort).
      </span>
    </label>
  )
}

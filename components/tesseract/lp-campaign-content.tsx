"use client"

/**
 * LP Campaign Content — /dashboard/outreach/lp-campaign
 *
 * 4-tab pipeline:
 *   1. Upload  — paste CSV rows or parse an uploaded XLSX
 *   2. Enrich  — streams SSE from /api/outreach/lp-campaign, shows live progress
 *   3. Review  — expandable LP cards, type badges, score badges, filter pills,
 *                search, sort, copy-to-clipboard email + DM tabs
 *   4. Export  — download .xlsx (Python/SheetJS) + .html review UI
 */

import { useState, useRef, useCallback, useMemo } from "react"
import type { User } from "@supabase/supabase-js"
import {
  Upload, Sparkles, Eye, Download, ChevronDown, ChevronUp,
  Copy, Check, Loader2, AlertTriangle, FileSpreadsheet, Globe,
  Mail, Linkedin, BarChart3, Users, Zap, Filter, Search,
  ArrowRight, RefreshCw, X, Info, Send, CheckCircle2, XCircle,
  Database, ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { InvestorProfile, EnrichedProfile, DraftedEmail, PipelineResult } from "@/lib/outreach/types"
import { buildXlsxBuffer, buildHtmlString } from "@/lib/outreach/browser-export"

// ─── Types ─────────────────────────────────────────────────────────────────

type Tab = "import" | "upload" | "enrich" | "review" | "export"

interface ProgressEvent {
  type: "progress" | "batch" | "result" | "error"
  step?: string
  done?: number
  total?: number
  name?: string
  batchNum?: number
  batchTotal?: number
  data?: PipelineResult
  message?: string
}

// ─── Colour maps ──────────────────────────────────────────────────────────────

const TYPE_STYLE: Record<string, { bg: string; text: string; border: string; avatar: string }> = {
  "Angel Investor":        { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", avatar: "bg-orange-600" },
  "Angel Investor / HNW": { bg: "bg-orange-50", text: "text-orange-800", border: "border-orange-200", avatar: "bg-orange-800" },
  "Angel":                 { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", avatar: "bg-orange-500" },
  "Family Office":         { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200",  avatar: "bg-green-600" },
  "Endowment":             { bg: "bg-teal-50",   text: "text-teal-700",   border: "border-teal-200",   avatar: "bg-teal-600" },
  "Institutional":         { bg: "bg-blue-50",   text: "text-blue-700",  border: "border-blue-200",   avatar: "bg-blue-600" },
  "Fund of Funds":         { bg: "bg-amber-50",  text: "text-amber-700", border: "border-amber-200",  avatar: "bg-amber-600" },
  "Sovereign Wealth Fund": { bg: "bg-purple-50", text: "text-purple-700",border: "border-purple-200", avatar: "bg-purple-600" },
  "Corporate VC":          { bg: "bg-rose-50",   text: "text-rose-700",  border: "border-rose-200",   avatar: "bg-rose-600" },
}
const DEFAULT_STYLE = { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", avatar: "bg-slate-500" }

function typeStyle(t: string) { return TYPE_STYLE[t] ?? DEFAULT_STYLE }

function scoreStyle(s: number) {
  if (s >= 70) return "bg-green-100 text-green-700"
  if (s >= 55) return "bg-blue-100 text-blue-700"
  if (s >= 40) return "bg-amber-100 text-amber-700"
  return "bg-red-100 text-red-700"
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")
}

// ─── CSV parser (no deps) ─────────────────────────────────────────────────────

function parseCSV(text: string): InvestorProfile[] {
  const lines = text.trim().split("\n").filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0]!.split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z_#/()]/g, ""))
  const col = (row: string[], key: string) => {
    const idx = headers.findIndex((h) => h.includes(key))
    return idx >= 0 ? (row[idx] ?? "").trim().replace(/^"|"$/g, "") : ""
  }
  return lines.slice(1).map((line, i) => {
    const cells = line.split(",")
    const rawType = col(cells, "lp_type") || col(cells, "lptype") || col(cells, "type")
    return {
      id: Number(col(cells, "#")) || i + 1,
      tier: (Number(col(cells, "tier")) || 2) as 1 | 2 | 3,
      score: Number(col(cells, "score")) || 50,
      name: col(cells, "name"),
      titleRole: col(cells, "title") || col(cells, "role"),
      lpType: rawType || "Institutional",
      tags: col(cells, "tags"),
      location: col(cells, "location"),
      email: col(cells, "email"),
      linkedin: col(cells, "linkedin"),
      sectors: col(cells, "sectors"),
      whyThisContact: col(cells, "why"),
      inferredWebsite: col(cells, "website") || col(cells, "inferred"),
      crawlStatus: col(cells, "crawl"),
      websiteTitle: col(cells, "title"),
      investmentFocusExtracted: col(cells, "investment_focus") || col(cells, "focus"),
      metaDescription: col(cells, "meta"),
      otherEmailsOnSite: col(cells, "other"),
      crawlPathsTried: col(cells, "crawl_paths"),
    }
  }).filter((p) => p.name)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border font-medium transition-all",
        copied
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
      )}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : label}
    </button>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs font-medium text-slate-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}

// ─── Profile Card ─────────────────────────────────────────────────────────────

function ProfileCard({ enriched, draft }: { enriched: EnrichedProfile; draft?: DraftedEmail }) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"email" | "dm">("email")
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const ts = typeStyle(enriched.lpType)

  async function handleSend() {
    if (!draft?.email || !draft.body) return
    if (!confirm(`Send email to ${enriched.name} <${draft.email}>? This dispatches via Resend immediately.`)) return
    setSending(true)
    setSendStatus(null)
    try {
      // Use the generic outreach send-email action with ad-hoc data
      const res = await fetch("/api/outreach/lp-campaign/send-one", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: draft.email,
          toName: draft.name,
          subject: draft.subject,
          body: draft.body,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setSendStatus({ ok: false, msg: data?.error ?? "Send failed" })
      } else {
        setSendStatus({ ok: true, msg: "Sent via Resend" })
      }
    } catch (e: any) {
      setSendStatus({ ok: false, msg: e?.message ?? "Send failed" })
    } finally { setSending(false) }
  }

  return (
    <div className={cn("bg-white rounded-xl border overflow-hidden transition-shadow hover:shadow-md", enriched.isMultiTouch ? "border-orange-200" : "border-slate-200")}>
      {/* Multi-touch banner */}
      {enriched.isMultiTouch && (
        <div className="bg-orange-50 border-b border-orange-200 px-4 py-1.5 text-xs text-orange-700 font-medium flex items-center gap-1.5">
          <Zap className="w-3 h-3" />
          Multi-touch — prior contact at firm: <strong>{enriched.multiTouchPriorContact}</strong>
        </div>
      )}

      {/* Header — always visible */}
      <button
        className="w-full text-left flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Avatar */}
        <div className={cn("w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold", ts.avatar)}>
          {initials(enriched.name)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-900 text-sm truncate">{enriched.name}</div>
          <div className="text-xs text-slate-500 truncate">{enriched.titleRole}</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", ts.bg, ts.text, ts.border)}>
              {enriched.lpType}
            </span>
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", scoreStyle(enriched.score ?? 0))}>
              Score {enriched.score}
            </span>
            {enriched.location && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                📍 {enriched.location.split(",")[0]}
              </span>
            )}
            {draft && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {draft.primaryChannel === "linkedin" ? "🔗 LinkedIn-first" : "✉️ Email"}
              </span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 text-slate-400 mt-1">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded body */}
      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          {/* Intel panels */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">🏢 Firm Intel</div>
              <p className="text-xs text-slate-700 leading-relaxed">{enriched.firmIntelligence}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">🎯 Mandate</div>
              <p className="text-xs text-slate-700 leading-relaxed">{enriched.investmentMandate}</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
              <div className="text-xs font-semibold text-amber-500 uppercase tracking-wide mb-1">⚡ Hook</div>
              <p className="text-xs text-slate-700 leading-relaxed">{enriched.personalisationHook}</p>
            </div>
          </div>

          {/* Email + DM preview */}
          {draft && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100">
                <button
                  onClick={() => setActiveTab("email")}
                  className={cn("text-xs px-2.5 py-1 rounded font-medium transition-colors", activeTab === "email" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-blue-100")}
                >
                  ✉️ Email
                </button>
                {draft.linkedInDM && (
                  <button
                    onClick={() => setActiveTab("dm")}
                    className={cn("text-xs px-2.5 py-1 rounded font-medium transition-colors", activeTab === "dm" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-blue-100")}
                  >
                    🔗 LinkedIn DM
                  </button>
                )}
                <div className="flex-1" />
                {activeTab === "email" && <CopyButton text={draft.subject} label="Subject" />}
                <CopyButton text={activeTab === "email" ? draft.body : draft.linkedInDM} label="Copy" />
              </div>

              {activeTab === "email" ? (
                <>
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-xs">
                    <span className="text-slate-400 mr-1.5">Subject:</span>
                    <span className="text-slate-800 font-medium">{draft.subject}</span>
                  </div>
                  <pre className="px-3 py-3 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap max-h-52 overflow-y-auto font-sans">{draft.body}</pre>
                  <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 flex items-center justify-between gap-2">
                    <span>To: <strong className="text-slate-600">{draft.email}</strong></span>
                    {draft.email && (
                      <button
                        onClick={handleSend}
                        disabled={sending || sendStatus?.ok === true}
                        className={cn(
                          "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium transition-all",
                          sendStatus?.ok
                            ? "bg-green-100 text-green-700 border border-green-200"
                            : "bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50"
                        )}
                      >
                        {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : sendStatus?.ok ? <CheckCircle2 className="w-3 h-3" /> : <Send className="w-3 h-3" />}
                        {sendStatus?.ok ? "Sent" : "Send via Resend"}
                      </button>
                    )}
                  </div>
                  {sendStatus && (
                    <div className={cn("px-3 py-1.5 border-t text-xs flex items-center gap-1.5", sendStatus.ok ? "bg-green-50 border-green-100 text-green-700" : "bg-red-50 border-red-100 text-red-600")}>
                      {sendStatus.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {sendStatus.msg}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="px-3 py-3 text-xs text-slate-700 leading-relaxed bg-blue-50">{draft.linkedInDM}</div>
                  <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 flex items-center gap-2">
                    {draft.linkedInDM.length} / 300 chars
                    {enriched.linkedin && (
                      <a href={enriched.linkedin} target="_blank" rel="noopener" className="text-blue-600 hover:underline flex items-center gap-0.5">
                        Open LinkedIn <ArrowRight className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props { user: User }

export function LpCampaignContent({ user: _user }: Props) {
  const [tab, setTab] = useState<Tab>("import")

  // ── Import state (DB import from enriched XLSX) ──────────────────────
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importCampaignName, setImportCampaignName] = useState("SVS Fund II — 282 Enriched LPs")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    ok: boolean; campaignId?: string; campaignName?: string
    profileCount?: number; stats?: { crmInserted: number; crmUpdated: number; members: number; messages: number }
    error?: string
  } | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)

  async function handleImport() {
    if (!importFile) return
    setImporting(true)
    setImportResult(null)
    try {
      const form = new FormData()
      form.append("file", importFile)
      form.append("campaignName", importCampaignName)
      const res = await fetch("/api/outreach/lp-campaign/import", { method: "POST", body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setImportResult({ ok: false, error: data?.error ?? "Import failed" })
      } else {
        setImportResult({ ok: true, ...data })
      }
    } catch (e: any) {
      setImportResult({ ok: false, error: e?.message ?? "Import failed" })
    } finally { setImporting(false) }
  }

  // Upload state
  const [csvText, setCsvText] = useState("")
  const [parsedProfiles, setParsedProfiles] = useState<InvestorProfile[]>([])
  const [parseError, setParseError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Enrichment state
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, name: "", batchNum: 0, batchTotal: 0 })
  const [streamError, setStreamError] = useState("")
  const [result, setResult] = useState<PipelineResult | null>(null)

  // Review state
  const [filterType, setFilterType] = useState("all")
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"score" | "name" | "tier">("score")
  const [showMtOnly, setShowMtOnly] = useState(false)

  // ── Parse CSV ────────────────────────────────────────────────────────────
  const handleParse = useCallback(() => {
    setParseError("")
    if (!csvText.trim()) { setParseError("Paste your CSV data first."); return }
    const profiles = parseCSV(csvText)
    if (!profiles.length) { setParseError("No profiles parsed — check column headers."); return }
    setParsedProfiles(profiles)
  }, [csvText])

  // ── File upload ──────────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    if (file.name.endsWith(".csv")) {
      const reader = new FileReader()
      reader.onload = (e) => { setCsvText(e.target?.result as string ?? "") }
      reader.readAsText(file)
    } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      // Parse XLSX client-side via SheetJS (already in package.json)
      import("xlsx").then((XLSX) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const wb = XLSX.read(e.target?.result, { type: "array" })
          const ws = wb.Sheets["Curated Profiles"] ?? wb.Sheets[wb.SheetNames[0]!]
          if (!ws) { setParseError("Could not find sheet in workbook."); return }
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })
          const profiles: InvestorProfile[] = rows.map((row, i) => ({
            id: Number(row["#"] ?? i + 1),
            tier: (Number(row["Tier"] ?? 2) || 2) as 1 | 2 | 3,
            score: Number(row["Score"] ?? 50),
            name: String(row["Name"] ?? ""),
            titleRole: String(row["Title/Role"] ?? ""),
            lpType: String(row["LP Type"] ?? "Institutional"),
            tags: String(row["Tags"] ?? ""),
            location: String(row["Location"] ?? ""),
            email: String(row["Email"] ?? ""),
            linkedin: String(row["LinkedIn"] ?? ""),
            sectors: String(row["Sectors"] ?? ""),
            whyThisContact: String(row["Why This Contact"] ?? ""),
            inferredWebsite: String(row["Inferred Website"] ?? ""),
            crawlStatus: String(row["Crawl Status"] ?? ""),
            websiteTitle: String(row["Website Title"] ?? ""),
            investmentFocusExtracted: String(row["Investment Focus (extracted)"] ?? ""),
            metaDescription: String(row["Meta Description"] ?? ""),
            otherEmailsOnSite: String(row["Other Emails on Site"] ?? ""),
            crawlPathsTried: String(row["Crawl Paths Tried"] ?? ""),
          })).filter((p) => p.name)
          setParsedProfiles(profiles)
          setParseError(profiles.length ? "" : "No rows parsed — check the sheet name is 'Curated Profiles'.")
        }
        reader.readAsArrayBuffer(file)
      })
    } else {
      setParseError("Upload a .csv or .xlsx file.")
    }
  }, [])

  // ── Run pipeline ─────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (!parsedProfiles.length) return
    setRunning(true)
    setStreamError("")
    setProgress({ done: 0, total: parsedProfiles.length, name: "", batchNum: 0, batchTotal: 0 })
    setResult(null)
    setTab("enrich")

    try {
      const resp = await fetch("/api/outreach/lp-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profiles: parsedProfiles }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }))
        throw new Error(err.error ?? "Pipeline failed")
      }

      const reader = resp.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const events = buf.split("\n\n")
        buf = events.pop() ?? ""
        for (const ev of events) {
          const line = ev.replace(/^data: /, "").trim()
          if (!line) continue
          try {
            const parsed: ProgressEvent = JSON.parse(line)
            if (parsed.type === "progress") {
              setProgress((p) => ({ ...p, done: parsed.done ?? p.done, total: parsed.total ?? p.total, name: parsed.name ?? "" }))
            } else if (parsed.type === "batch") {
              setProgress((p) => ({ ...p, batchNum: parsed.batchNum ?? p.batchNum, batchTotal: parsed.batchTotal ?? p.batchTotal }))
            } else if (parsed.type === "result") {
              setResult(parsed.data ?? null)
              setTab("review")
            } else if (parsed.type === "error") {
              setStreamError(parsed.message ?? "Unknown error")
            }
          } catch { /* ignore malformed events */ }
        }
      }
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }, [parsedProfiles])

  // ── Filtered + sorted profiles ───────────────────────────────────────────
  const displayProfiles = useMemo(() => {
    if (!result) return []
    const draftMap = new Map(result.drafts.map((d) => [d.investorId, d]))
    let items = result.enriched.map((e) => ({ enriched: e, draft: draftMap.get(e.id) }))

    if (filterType !== "all") items = items.filter((i) => i.enriched.lpType === filterType)
    if (showMtOnly) items = items.filter((i) => i.enriched.isMultiTouch)
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((i) =>
        i.enriched.name.toLowerCase().includes(q) ||
        i.enriched.lpType.toLowerCase().includes(q) ||
        i.enriched.sectors.toLowerCase().includes(q) ||
        i.enriched.location.toLowerCase().includes(q)
      )
    }
    items.sort((a, b) => {
      if (sortBy === "score") return (b.enriched.score ?? 0) - (a.enriched.score ?? 0)
      if (sortBy === "name") return a.enriched.name.localeCompare(b.enriched.name)
      if (sortBy === "tier") return (a.enriched.tier ?? 3) - (b.enriched.tier ?? 3)
      return 0
    })
    return items
  }, [result, filterType, showMtOnly, search, sortBy])

  const lpTypes = useMemo(() => result ? [...new Set(result.enriched.map((e) => e.lpType))] : [], [result])

  // ── Export ───────────────────────────────────────────────────────────────
  const downloadXlsx = useCallback(() => {
    if (!result) return
    const buf = buildXlsxBuffer(result)
    const blob = new Blob([buf.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `svs-campaign-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click(); URL.revokeObjectURL(url)
  }, [result])

  const downloadHtml = useCallback(() => {
    if (!result) return
    const html = buildHtmlString(result)
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `svs-campaign-${new Date().toISOString().slice(0, 10)}.html`
    a.click(); URL.revokeObjectURL(url)
  }, [result])

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  // ── Tab definitions ──────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string; icon: React.ElementType; disabled?: boolean }[] = [
    { id: "import",  label: "Import DB",  icon: Database },
    { id: "upload",  label: "1. Upload",  icon: Upload },
    { id: "enrich",  label: "2. Enrich",  icon: Sparkles, disabled: !parsedProfiles.length },
    { id: "review",  label: "3. Review",  icon: Eye,      disabled: !result },
    { id: "export",  label: "4. Export",  icon: Download, disabled: !result },
  ]

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              LP Campaign Studio
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Summit Venture Studio Fund II · Philippe M. Masindet · invest@svsfund.vc
            </p>
          </div>
          {result && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadXlsx} className="gap-1.5">
                <FileSpreadsheet className="w-4 h-4" /> Download XLSX
              </Button>
              <Button variant="outline" size="sm" onClick={downloadHtml} className="gap-1.5">
                <Globe className="w-4 h-4" /> Download HTML
              </Button>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mt-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              disabled={t.disabled}
              onClick={() => !t.disabled && setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all",
                tab === t.id
                  ? "bg-slate-900 text-white"
                  : t.disabled
                    ? "text-slate-300 cursor-not-allowed"
                    : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Import DB ───────────────────────────────────────────────── */}
      {tab === "import" && (
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-xl mx-auto space-y-5">

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
              <div className="font-semibold flex items-center gap-2"><Database className="w-4 h-4" /> Import Enriched Outreach XLSX → Database</div>
              <p className="text-xs leading-relaxed">
                Upload <strong>SVS_Fund_II_Enriched_Outreach_282.xlsx</strong> (or any same-format enriched outreach file)
                to import all 282 LP profiles, email drafts, and LinkedIn DMs directly into your CRM and Outreach
                campaign. The import is idempotent — re-uploading updates existing rows.
              </p>
              <ul className="text-xs list-disc list-inside space-y-0.5 text-blue-700 mt-1">
                <li>Creates <strong>crm_entries</strong> for all LP profiles (visible in CRM page)</li>
                <li>Creates an <strong>outreach campaign</strong> with all 282 members</li>
                <li>Stores <strong>email drafts</strong> and <strong>LinkedIn DMs</strong> as outreach messages</li>
                <li>Sets outreach status, tier, score, research summary on each CRM row</li>
              </ul>
            </div>

            {/* Campaign name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Campaign name</label>
              <input
                value={importCampaignName}
                onChange={(e) => setImportCampaignName(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* File drop */}
            <div
              className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
              onClick={() => importFileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setImportFile(f) }}
            >
              <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              {importFile ? (
                <div className="space-y-1">
                  <p className="font-medium text-slate-700">{importFile.name}</p>
                  <p className="text-xs text-slate-500">{(importFile.size / 1024).toFixed(0)} KB — ready to import</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium text-slate-700">Drop your enriched outreach .xlsx here</p>
                  <p className="text-xs text-slate-500">Sheets needed: Curated Profiles (Enriched) · Email Drafts (Enriched) · LinkedIn DMs</p>
                </div>
              )}
              <input ref={importFileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportFile(f) }} />
            </div>

            <Button
              onClick={handleImport}
              disabled={!importFile || importing}
              className="w-full gap-2"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              {importing ? "Importing 282 profiles…" : "Import into CRM + Outreach"}
            </Button>

            {/* Result */}
            {importResult && (
              <div className={cn(
                "rounded-xl border p-4 space-y-3",
                importResult.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
              )}>
                {importResult.ok ? (
                  <>
                    <div className="flex items-center gap-2 text-green-700 font-semibold">
                      <CheckCircle2 className="w-5 h-5" /> Import complete
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-white rounded-lg border border-green-200 px-3 py-2">
                        <div className="text-xl font-bold text-green-700">{(importResult.stats?.crmInserted ?? 0) + (importResult.stats?.crmUpdated ?? 0)}</div>
                        <div className="text-xs text-slate-500">CRM entries ({importResult.stats?.crmInserted} new · {importResult.stats?.crmUpdated} updated)</div>
                      </div>
                      <div className="bg-white rounded-lg border border-green-200 px-3 py-2">
                        <div className="text-xl font-bold text-green-700">{importResult.stats?.members}</div>
                        <div className="text-xs text-slate-500">Campaign members</div>
                      </div>
                      <div className="bg-white rounded-lg border border-green-200 px-3 py-2">
                        <div className="text-xl font-bold text-green-700">{importResult.stats?.messages}</div>
                        <div className="text-xs text-slate-500">Outreach messages (email + DM)</div>
                      </div>
                      <div className="bg-white rounded-lg border border-green-200 px-3 py-2 col-span-1">
                        <div className="text-xs font-medium text-slate-700 truncate">{importResult.campaignName}</div>
                        <div className="text-xs text-slate-500">Campaign created</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href="/dashboard/outreach"
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Open in Outreach
                      </a>
                      <a
                        href="/dashboard/crm"
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
                      >
                        <Users className="w-3.5 h-3.5" /> Open in CRM
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start gap-2 text-red-700">
                    <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium">Import failed</div>
                      <div className="text-xs font-mono mt-1">{importResult.error}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-slate-400 text-center">
              Prefer CLI? Run: <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">node scripts/import-svs-campaign.mjs &lt;path.xlsx&gt;</code>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Upload ───────────────────────────────────────────────────── */}
      {tab === "upload" && (
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto space-y-5">

            {/* Drag-drop / file upload */}
            <div
              className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="font-medium text-slate-700">Drop your Curated Profiles file here</p>
              <p className="text-sm text-slate-500 mt-1">
                Accepts <strong>.xlsx</strong> (SVS_Fund_II_Curated_Outreach.xlsx "Curated Profiles" sheet) or <strong>.csv</strong>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="flex-1 border-t border-slate-200" />
              or paste CSV data below
              <div className="flex-1 border-t border-slate-200" />
            </div>

            {/* CSV paste area */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Paste CSV rows</label>
              <p className="text-xs text-slate-500">
                Expected columns: <code className="bg-slate-100 px-1 rounded">#, Tier, Score, Name, Title/Role, LP Type, Tags, Location, Email, LinkedIn, Sectors, Why This Contact, Inferred Website, ...</code>
              </p>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={8}
                className="w-full text-xs font-mono border border-slate-200 rounded-lg p-3 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="#,Tier,Score,Name,Title/Role,LP Type,Tags,Location,Email,LinkedIn,Sectors,Why This Contact..."
              />
              <Button onClick={handleParse} variant="outline" size="sm">Parse CSV</Button>
            </div>

            {parseError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {parseError}
              </div>
            )}

            {parsedProfiles.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <Check className="w-4 h-4" />
                    {parsedProfiles.length} profiles ready
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setParsedProfiles([])} className="text-slate-400 h-7 px-2">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Quick preview */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {parsedProfiles.slice(0, 3).map((p) => (
                    <div key={p.id} className="bg-white rounded-lg border border-green-200 p-2.5">
                      <div className="font-medium text-slate-800 truncate">{p.name}</div>
                      <div className="text-slate-500 truncate">{p.lpType}</div>
                      <div className="text-slate-400 truncate">{p.email}</div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={handleRun} disabled={running} className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Run Campaign ({parsedProfiles.length} profiles, {Math.ceil(parsedProfiles.length / 10)} batches)
                  </Button>
                  <p className="text-xs text-slate-500">
                    ~{Math.ceil(parsedProfiles.length / 10) * 15}s estimated
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Enrich ───────────────────────────────────────────────────── */}
      {tab === "enrich" && (
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-xl mx-auto space-y-6">
            {/* Batch info */}
            {progress.batchTotal > 0 && (
              <div className="text-center text-sm text-slate-500">
                Batch {progress.batchNum} of {progress.batchTotal}
                <span className="text-slate-400 ml-1">(≤10 profiles per batch, 2s gap between)</span>
              </div>
            )}

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-slate-700">
                  {running ? `Enriching ${progress.name || "…"}` : result ? "Complete" : "Waiting"}
                </span>
                <span className="text-slate-500">{progress.done}/{progress.total}</span>
              </div>
              <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-right text-xs text-slate-400">{pct}%</div>
            </div>

            {/* Live name ticker */}
            {running && progress.name && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                Enriching <strong>{progress.name}</strong>…
              </div>
            )}

            {/* Error */}
            {streamError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Pipeline error</div>
                  <div className="text-xs mt-0.5 font-mono">{streamError}</div>
                </div>
              </div>
            )}

            {/* Done state */}
            {result && !running && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center space-y-3">
                <div className="text-green-700 font-semibold text-lg flex items-center justify-center gap-2">
                  <Check className="w-5 h-5" /> Pipeline complete
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Profiles" value={result.stats.total} />
                  <StatCard label="Avg Score" value={result.stats.avgScore} />
                  <StatCard label="Multi-Touch" value={result.stats.multiTouchCount} />
                </div>
                <Button onClick={() => setTab("review")} className="gap-2">
                  <Eye className="w-4 h-4" /> Review profiles
                </Button>
              </div>
            )}

            {/* Info box */}
            {!running && !result && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                Go to the Upload tab, add profiles, then click Run Campaign to start enrichment.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Review ──────────────────────────────────────────────────── */}
      {tab === "review" && result && (
        <div className="flex-1 overflow-auto">
          {/* Stats bar */}
          <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 space-y-2.5">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <StatCard label="Total" value={result.stats.total} />
                <StatCard label="Avg Score" value={result.stats.avgScore} />
                <StatCard label="Tier 1" value={result.stats.tier1Count} sub="score ≥60" />
                <StatCard label="Multi-Touch" value={result.stats.multiTouchCount} />
              </div>
              <div className="flex-1 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setTab("export")} className="gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Export
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setParsedProfiles([]); setResult(null); setTab("upload") }} className="gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> New campaign
                </Button>
              </div>
            </div>

            {/* Filter + search row */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setFilterType("all")}
                className={cn("text-xs px-2.5 py-1 rounded-full border font-medium transition-all", filterType === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}
              >
                All <span className="ml-0.5 opacity-70">{result.enriched.length}</span>
              </button>
              {lpTypes.map((t) => {
                const ts = typeStyle(t)
                const count = result.stats.byLPType[t] ?? 0
                return (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={cn("text-xs px-2.5 py-1 rounded-full border font-medium transition-all", filterType === t ? cn(ts.bg, ts.text, ts.border, "ring-1 ring-current") : cn("bg-white text-slate-600 border-slate-200 hover:bg-slate-50"))}
                  >
                    {t} <span className="ml-0.5 opacity-70">{count}</span>
                  </button>
                )
              })}
              <div className="flex-1" />
              <label className="text-xs text-slate-500 flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showMtOnly} onChange={(e) => setShowMtOnly(e.target.checked)} className="rounded" />
                Multi-touch only
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700"
              >
                <option value="score">Score ↓</option>
                <option value="name">Name A→Z</option>
                <option value="tier">Tier</option>
              </select>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="pl-7 h-8 text-xs w-44"
                />
              </div>
            </div>
          </div>

          {/* Cards */}
          <div className="p-5 space-y-3 max-w-4xl mx-auto">
            {displayProfiles.length === 0 ? (
              <div className="text-center py-16 text-slate-400">No profiles match your filters.</div>
            ) : displayProfiles.map(({ enriched, draft }) => (
              <ProfileCard key={enriched.id} enriched={enriched} draft={draft} />
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Export ──────────────────────────────────────────────────── */}
      {tab === "export" && result && (
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-xl mx-auto space-y-4">
            <h2 className="text-base font-semibold text-slate-800">Export campaign outputs</h2>

            {/* Stats summary */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="Total LPs" value={result.stats.total} />
              <StatCard label="Avg Score" value={result.stats.avgScore} />
              <StatCard label="Batches" value={result.stats.batches} />
              <StatCard label="Multi-Touch" value={result.stats.multiTouchCount} />
            </div>

            {/* LP type breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" /> LP Type Breakdown
              </div>
              {Object.entries(result.stats.byLPType).sort((a, b) => b[1] - a[1]).map(([t, c]) => {
                const ts = typeStyle(t)
                return (
                  <div key={t} className="flex items-center gap-2">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium w-44 truncate", ts.bg, ts.text, ts.border)}>{t}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round(c / result.stats.total * 100)}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 w-8 text-right">{c}</span>
                  </div>
                )
              })}
            </div>

            {/* Channel breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Primary Channel
              </div>
              <div className="flex gap-3">
                {Object.entries(result.stats.byChannel).filter(([, v]) => v > 0).map(([ch, c]) => (
                  <div key={ch} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    {ch === "linkedin" ? <Linkedin className="w-3.5 h-3.5 text-blue-600" /> : <Mail className="w-3.5 h-3.5 text-slate-600" />}
                    <span className="text-sm font-semibold">{c}</span>
                    <span className="text-xs text-slate-500 capitalize">{ch}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Download buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={downloadXlsx}
                className="flex flex-col items-center gap-2 bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:bg-blue-50/30 transition-all text-left"
              >
                <FileSpreadsheet className="w-7 h-7 text-green-600" />
                <div>
                  <div className="font-semibold text-slate-800">Excel Workbook</div>
                  <div className="text-xs text-slate-500 mt-0.5">6 sheets: Enriched Profiles, Email Drafts, LinkedIn DMs, Summary, Multi-Touch, Methodology</div>
                </div>
                <div className="flex items-center gap-1 text-xs text-blue-600 font-medium mt-1">
                  <Download className="w-3.5 h-3.5" /> Download .xlsx
                </div>
              </button>

              <button
                onClick={downloadHtml}
                className="flex flex-col items-center gap-2 bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:bg-blue-50/30 transition-all text-left"
              >
                <Globe className="w-7 h-7 text-blue-600" />
                <div>
                  <div className="font-semibold text-slate-800">HTML Review UI</div>
                  <div className="text-xs text-slate-500 mt-0.5">Self-contained page with expandable cards, filter pills, copy buttons — open in any browser</div>
                </div>
                <div className="flex items-center gap-1 text-xs text-blue-600 font-medium mt-1">
                  <Download className="w-3.5 h-3.5" /> Download .html
                </div>
              </button>
            </div>

            <p className="text-xs text-slate-400 text-center">
              Generated {new Date(result.generatedAt).toLocaleString()} · Drafts only — no auto-send
            </p>
          </div>
        </div>
      )}

      {/* Fallback for disabled tabs */}
      {(tab === "review" || tab === "export") && !result && (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Run the pipeline first to see results here.
        </div>
      )}
    </div>
  )
}

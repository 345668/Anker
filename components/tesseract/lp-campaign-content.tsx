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
import { useLpCampaignWebMcp } from "@/components/webmcp/lp-campaign-tools"
import type { User } from "@supabase/supabase-js"
import {
  Upload, Sparkles, Eye, Download, ChevronDown, ChevronUp,
  Copy, Check, Loader2, AlertTriangle, FileSpreadsheet, Globe,
  Mail, Linkedin, BarChart3, Users, Zap, Filter, Search,
  ArrowRight, RefreshCw, X, Info, Send, CheckCircle2, XCircle,
  Database, ExternalLink, Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/shell/page-header"
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
  "Angel Investor":        { bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-300", border: "border-orange-500/30", avatar: "bg-orange-600" },
  "Angel Investor / HNW": { bg: "bg-orange-500/10", text: "text-orange-800 dark:text-orange-300", border: "border-orange-500/30", avatar: "bg-orange-800" },
  "Angel":                 { bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-300", border: "border-orange-500/30", avatar: "bg-orange-500" },
  "Family Office":         { bg: "bg-green-500/10",  text: "text-green-700 dark:text-green-300",  border: "border-green-500/30",  avatar: "bg-green-600" },
  "Endowment":             { bg: "bg-teal-500/10",   text: "text-teal-700 dark:text-teal-300",   border: "border-teal-500/30",   avatar: "bg-teal-600" },
  "Institutional":         { bg: "bg-blue-500/10",   text: "text-blue-700 dark:text-blue-300",  border: "border-blue-500/30",   avatar: "bg-blue-600" },
  "Fund of Funds":         { bg: "bg-amber-500/10",  text: "text-amber-700 dark:text-amber-300", border: "border-amber-500/30",  avatar: "bg-amber-600" },
  "Sovereign Wealth Fund": { bg: "bg-purple-500/10", text: "text-purple-700 dark:text-purple-300",border: "border-purple-500/30", avatar: "bg-purple-600" },
  "Corporate VC":          { bg: "bg-rose-500/10",   text: "text-rose-700 dark:text-rose-300",  border: "border-rose-500/30",   avatar: "bg-rose-600" },
}
const DEFAULT_STYLE = { bg: "bg-muted/40", text: "text-foreground", border: "border-border", avatar: "bg-slate-500" }

function typeStyle(t: string) { return TYPE_STYLE[t] ?? DEFAULT_STYLE }

function scoreStyle(s: number) {
  if (s >= 70) return "bg-green-500/20 text-green-700 dark:text-green-300"
  if (s >= 55) return "bg-blue-500/20 text-blue-700 dark:text-blue-300"
  if (s >= 40) return "bg-amber-500/20 text-amber-700 dark:text-amber-300"
  return "bg-red-500/20 text-red-700 dark:text-red-300"
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")
}

// ─── Flexible header matcher ──────────────────────────────────────────────────
//
// The LP Campaign Studio originally rejected anything that wasn't the exact
// SVS Curated Profiles schema. In practice users paste lists from VC databases,
// Crunchbase exports, Excel workbooks with their own column names ("Firm",
// "Ctry", "Thesis / sector", "Recommended action", "LP-fit", "Qual /17"...).
//
// `normalizeRows()` accepts ANY header shape, fuzzy-matches each header to a
// canonical InvestorProfile field via the alias map below, and surfaces the
// detected mapping so the user can spot mismatches. A row is kept if it has
// at least one of {name, email, linkedin} populated.

type CanonicalField =
  | "id" | "tier" | "score" | "name" | "titleRole" | "lpType" | "tags"
  | "location" | "email" | "linkedin" | "sectors" | "whyThisContact"
  | "inferredWebsite" | "crawlStatus" | "websiteTitle"
  | "investmentFocusExtracted" | "metaDescription" | "otherEmailsOnSite"
  | "crawlPathsTried"

const HEADER_ALIASES: Record<CanonicalField, string[]> = {
  id:                       ["#", "id", "row", "no", "number", "index"],
  tier:                     ["tier", "priority", "rank"],
  score:                    ["score", "lp-fit", "lpfit", "fit", "qual", "match score", "match", "rating"],
  name:                     ["name", "firm name", "firm", "company", "investor", "investor name", "account", "lp", "org", "organization", "full name", "contact name"],
  titleRole:                ["title/role", "title", "role", "position", "job title", "job"],
  lpType:                   ["lp type", "investor type", "type", "lp-veh", "vehicle", "category", "fund type"],
  tags:                     ["tags", "labels", "categories", "categorisation"],
  location:                 ["location", "ctry", "country", "hq", "hq location", "geo", "geography", "region", "city", "address"],
  email:                    ["email", "email address", "contact email", "e-mail", "mail"],
  linkedin:                 ["linkedin", "linkedin url", "li url", "li", "linkedin profile"],
  sectors:                  ["sectors", "sector", "thesis / sector", "thesis/sector", "thesis", "industry", "industries", "verticals", "focus areas", "focus area", "focus"],
  whyThisContact:           ["why this contact", "why", "comments", "comment", "notes", "note", "recommended action", "recommendation", "rationale", "reason", "reasoning"],
  inferredWebsite:          ["inferred website", "website", "web", "url", "domain", "site", "homepage"],
  crawlStatus:              ["crawl status", "crawl"],
  websiteTitle:             ["website title", "site title"],
  investmentFocusExtracted: ["investment focus (extracted)", "investment focus", "investment focus extracted"],
  metaDescription:          ["meta description", "meta", "description"],
  otherEmailsOnSite:        ["other emails on site", "other emails", "emails on site"],
  crawlPathsTried:          ["crawl paths tried", "crawl paths"],
}

function normHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Pick the source-column whose header best matches a canonical field. Exact
 *  normalized match wins, then substring containment (alias must be ≥3 chars). */
function pickColumn(headers: string[], aliases: string[]): string | null {
  const norms = headers.map(normHeader)
  for (const a of aliases) {
    const na = normHeader(a)
    if (!na) continue
    const idx = norms.indexOf(na)
    if (idx >= 0) return headers[idx]!
  }
  for (const a of aliases) {
    const na = normHeader(a)
    if (na.length < 3) continue
    const idx = norms.findIndex((h) => h.includes(na))
    if (idx >= 0) return headers[idx]!
  }
  return null
}

export interface NormalizeRowsResult {
  profiles: InvestorProfile[]
  detectedColumns: Partial<Record<CanonicalField, string | null>>
  droppedCount: number
}

function normalizeRows(rows: Record<string, unknown>[]): NormalizeRowsResult {
  if (!rows.length) return { profiles: [], detectedColumns: {}, droppedCount: 0 }

  // Build the header list from the union of keys across the first few rows
  // (SheetJS' sheet_to_json sometimes drops empty trailing cells on the first row).
  const headerSet = new Set<string>()
  for (const r of rows.slice(0, 5)) for (const k of Object.keys(r)) if (k) headerSet.add(k)
  const headers = Array.from(headerSet)

  const detected: Partial<Record<CanonicalField, string | null>> = {}
  for (const key of Object.keys(HEADER_ALIASES) as CanonicalField[]) {
    detected[key] = pickColumn(headers, HEADER_ALIASES[key])
  }

  let dropped = 0
  const profiles: InvestorProfile[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const v = (key: CanonicalField): string => {
      const h = detected[key]
      if (!h) return ""
      const x = row[h]
      return x == null ? "" : String(x).trim()
    }
    const firstName = ""  // reserved; some sheets split first/last - we fall through to Name
    const name = v("name") || firstName
    const email = v("email")
    const linkedin = v("linkedin")
    if (!name && !email && !linkedin) { dropped++; continue }
    const niceName = name || (email ? email.split("@")[0]! : `Profile ${i + 1}`)
    profiles.push({
      id: Number(v("id")) || i + 1,
      tier: (Number(v("tier")) || 2) as 1 | 2 | 3,
      score: Number(v("score")) || 50,
      name: niceName,
      titleRole: v("titleRole"),
      lpType: (v("lpType") || "Institutional") as InvestorProfile["lpType"],
      tags: v("tags"),
      location: v("location"),
      email,
      linkedin,
      sectors: v("sectors"),
      whyThisContact: v("whyThisContact"),
      inferredWebsite: v("inferredWebsite"),
      crawlStatus: v("crawlStatus"),
      websiteTitle: v("websiteTitle"),
      investmentFocusExtracted: v("investmentFocusExtracted"),
      metaDescription: v("metaDescription"),
      otherEmailsOnSite: v("otherEmailsOnSite"),
      crawlPathsTried: v("crawlPathsTried"),
    })
  }
  return { profiles, detectedColumns: detected, droppedCount: dropped }
}

/** Parse a CSV string via SheetJS so quoted fields + multi-line cells work. */
async function parseCsvString(text: string): Promise<NormalizeRowsResult> {
  const XLSX = await import("xlsx")
  const wb = XLSX.read(text, { type: "string" })
  const ws = wb.Sheets[wb.SheetNames[0]!]
  if (!ws) return { profiles: [], detectedColumns: {}, droppedCount: 0 }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })
  return normalizeRows(rows)
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
          ? "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30"
          : "bg-card text-muted-foreground border-border hover:bg-muted/40"
      )}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : label}
    </button>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card rounded-lg border border-border px-4 py-3">
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs font-medium text-muted-foreground mt-0.5">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
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
    <div className={cn("bg-card rounded-xl border overflow-hidden transition-shadow hover:shadow-md", enriched.isMultiTouch ? "border-orange-500/30" : "border-border")}>
      {/* Multi-touch banner */}
      {enriched.isMultiTouch && (
        <div className="bg-orange-500/10 border-b border-orange-500/30 px-4 py-1.5 text-xs text-orange-700 dark:text-orange-300 font-medium flex items-center gap-1.5">
          <Zap className="w-3 h-3" />
          Multi-touch — prior contact at firm: <strong>{enriched.multiTouchPriorContact}</strong>
        </div>
      )}

      {/* Header — always visible */}
      <button
        className="w-full text-left flex items-start gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Avatar */}
        <div className={cn("w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold", ts.avatar)}>
          {initials(enriched.name)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground text-sm truncate">{enriched.name}</div>
          <div className="text-xs text-muted-foreground truncate">{enriched.titleRole}</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", ts.bg, ts.text, ts.border)}>
              {enriched.lpType}
            </span>
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", scoreStyle(enriched.score ?? 0))}>
              Score {enriched.score}
            </span>
            {enriched.location && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                📍 {enriched.location.split(",")[0]}
              </span>
            )}
            {draft && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {draft.primaryChannel === "linkedin" ? "🔗 LinkedIn-first" : "✉️ Email"}
              </span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 text-muted-foreground mt-1">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded body */}
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {/* Intel panels */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-muted/40 rounded-lg p-3 border border-border">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">🏢 Firm Intel</div>
              <p className="text-xs text-foreground leading-relaxed">{enriched.firmIntelligence}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 border border-border">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">🎯 Mandate</div>
              <p className="text-xs text-foreground leading-relaxed">{enriched.investmentMandate}</p>
            </div>
            <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/30">
              <div className="text-xs font-semibold text-amber-500 uppercase tracking-wide mb-1">⚡ Hook</div>
              <p className="text-xs text-foreground leading-relaxed">{enriched.personalisationHook}</p>
            </div>
          </div>

          {/* Email + DM preview */}
          {draft && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border-b border-blue-500/20">
                <button
                  onClick={() => setActiveTab("email")}
                  className={cn("text-xs px-2.5 py-1 rounded font-medium transition-colors", activeTab === "email" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-foreground/5")}
                >
                  ✉️ Email
                </button>
                {draft.linkedInDM && (
                  <button
                    onClick={() => setActiveTab("dm")}
                    className={cn("text-xs px-2.5 py-1 rounded font-medium transition-colors", activeTab === "dm" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-foreground/5")}
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
                  <div className="px-3 py-2 bg-muted/40 border-b border-border text-xs">
                    <span className="text-muted-foreground mr-1.5">Subject:</span>
                    <span className="text-foreground font-medium">{draft.subject}</span>
                  </div>
                  <pre className="px-3 py-3 text-xs text-foreground leading-relaxed whitespace-pre-wrap max-h-52 overflow-y-auto font-sans">{draft.body}</pre>
                  <div className="px-3 py-1.5 bg-muted/40 border-t border-border text-xs text-muted-foreground flex items-center justify-between gap-2">
                    <span>To: <strong className="text-muted-foreground">{draft.email}</strong></span>
                    {draft.email && (
                      <button
                        onClick={handleSend}
                        disabled={sending || sendStatus?.ok === true}
                        className={cn(
                          "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium transition-all",
                          sendStatus?.ok
                            ? "bg-green-500/20 text-green-700 dark:text-green-300 border border-green-500/30"
                            : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        )}
                      >
                        {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : sendStatus?.ok ? <CheckCircle2 className="w-3 h-3" /> : <Send className="w-3 h-3" />}
                        {sendStatus?.ok ? "Sent" : "Send via Resend"}
                      </button>
                    )}
                  </div>
                  {sendStatus && (
                    <div className={cn("px-3 py-1.5 border-t text-xs flex items-center gap-1.5", sendStatus.ok ? "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300" : "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400")}>
                      {sendStatus.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {sendStatus.msg}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="px-3 py-3 text-xs text-foreground leading-relaxed bg-blue-500/10">{draft.linkedInDM}</div>
                  <div className="px-3 py-1.5 bg-muted/40 border-t border-border text-xs text-muted-foreground flex items-center gap-2">
                    {draft.linkedInDM.length} / 300 chars
                    {enriched.linkedin && (
                      <a href={enriched.linkedin} target="_blank" rel="noopener" className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
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

  useLpCampaignWebMcp({
    hasFile: Boolean(importFile),
    onEnrich: async () => {
      try { await handleImport(); return { ok: true } }
      catch (e: any) { return { ok: false, msg: e?.message || "Enrich failed" } }
    },
    onGenerateDrafts: async (voice: "founder" | "managing_partner" | "auto") => {
      try {
        const r = await fetch("/api/outreach/lp-campaign/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voice }),
        })
        if (!r.ok) return { ok: false, msg: `HTTP ${r.status}` }
        return { ok: true }
      } catch (e: any) { return { ok: false, msg: e?.message } }
    },
    onApplyTemplate: async (template_id: string) => {
      try {
        const r = await fetch("/api/outreach/lp-campaign/apply-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template_id }),
        })
        if (!r.ok) return { ok: false, msg: `HTTP ${r.status}` }
        return { ok: true }
      } catch (e: any) { return { ok: false, msg: e?.message } }
    },
  })
  const [importCampaignName, setImportCampaignName] = useState("Enriched LP campaign")
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
  const [detectedColumns, setDetectedColumns] = useState<Partial<Record<CanonicalField, string | null>>>({})
  const [droppedCount, setDroppedCount] = useState(0)
  const [parseSourceLabel, setParseSourceLabel] = useState("")  // e.g. "Sheet1 (XLSX) - 282 rows"
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

  // ── Apply a normalised result to state (shared by CSV + XLSX paths) ─────
  const applyParseResult = useCallback((res: NormalizeRowsResult, sourceLabel: string) => {
    setDetectedColumns(res.detectedColumns)
    setDroppedCount(res.droppedCount)
    setParseSourceLabel(sourceLabel)
    setParsedProfiles(res.profiles)
    if (!res.profiles.length) {
      const hint = res.droppedCount > 0
        ? `Headers detected but every row was missing a Name, Email, AND LinkedIn. ${res.droppedCount} row(s) skipped.`
        : "No rows found. Make sure the first line contains column headers."
      setParseError(hint)
    } else {
      setParseError("")
    }
  }, [])

  // ── Parse CSV ────────────────────────────────────────────────────────────
  const handleParse = useCallback(async () => {
    setParseError("")
    if (!csvText.trim()) { setParseError("Paste your CSV data first."); return }
    try {
      const res = await parseCsvString(csvText)
      applyParseResult(res, "Pasted CSV")
    } catch (e: any) {
      setParseError(`Could not parse CSV: ${e?.message ?? "unknown error"}`)
    }
  }, [csvText, applyParseResult])

  // ── File upload ──────────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    setParseError("")
    if (file.name.endsWith(".csv")) {
      // Read text, then run through the same normaliser so quoted multi-line cells work.
      const reader = new FileReader()
      reader.onload = async (e) => {
        const txt = (e.target?.result as string) ?? ""
        setCsvText(txt)
        try {
          const res = await parseCsvString(txt)
          applyParseResult(res, `${file.name} (CSV)`)
        } catch (err: any) {
          setParseError(`Could not parse CSV: ${err?.message ?? "unknown error"}`)
        }
      }
      reader.readAsText(file)
    } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      // Parse XLSX client-side via SheetJS, auto-pick the first non-empty sheet
      // (or honour a "Curated Profiles" sheet if present for back-compat).
      import("xlsx").then((XLSX) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          let wb
          try {
            wb = XLSX.read(e.target?.result, { type: "array" })
          } catch (err: any) {
            setParseError(`Could not read XLSX: ${err?.message ?? "unknown error"}`); return
          }
          // Sheet selection: prefer the canonical SVS name, then any sheet name
          // containing "profile" or "lp" or "contact", then the first sheet with data.
          const preferredNames = ["Curated Profiles", "Curated Profiles (Enriched)", "Profiles"]
          let chosenName = preferredNames.find((n) => wb.SheetNames.includes(n)) ?? null
          if (!chosenName) {
            chosenName = wb.SheetNames.find((n) => /profile|investor|lp|contact|lead/i.test(n)) ?? null
          }
          if (!chosenName) {
            // First sheet that has at least 1 data row beyond the header
            chosenName = wb.SheetNames.find((n) => {
              const sh = wb.Sheets[n]
              if (!sh) return false
              const r = XLSX.utils.sheet_to_json(sh, { defval: "" }) as unknown[]
              return r.length > 0
            }) ?? wb.SheetNames[0] ?? null
          }
          if (!chosenName) { setParseError("Workbook has no sheets."); return }
          const ws = wb.Sheets[chosenName]
          if (!ws) { setParseError(`Sheet "${chosenName}" not readable.`); return }
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })
          const result = normalizeRows(rows)
          applyParseResult(result, `${file.name} - "${chosenName}" sheet`)
        }
        reader.readAsArrayBuffer(file)
      })
    } else {
      setParseError("Upload a .csv or .xlsx file.")
    }
  }, [applyParseResult])

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
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="bg-background border-b border-foreground/10 px-6 lg:px-8 py-6">
        <PageHeader
          accent="#2f45e0"
          eyebrow="Relationships · LP outreach"
          title="LP Campaign"
          description="Upload or import your LP list, let AI enrich each with firm intel, mandate, and a personalized hook, then review and export a ready-to-send workbook."
          actions={result ? (
            <>
              <Button variant="outline" size="sm" onClick={downloadXlsx} className="gap-1.5">
                <FileSpreadsheet className="w-4 h-4" /> Download XLSX
              </Button>
              <Button variant="outline" size="sm" onClick={downloadHtml} className="gap-1.5">
                <Globe className="w-4 h-4" /> Download HTML
              </Button>
            </>
          ) : undefined}
        />

        {/* Step tab bar — clickable pipeline nav; locked steps unlock as you progress */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                disabled={t.disabled}
                onClick={() => !t.disabled && setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-2 h-9 px-3.5 rounded-md text-sm font-medium transition-colors border",
                  active
                    ? "bg-foreground text-background border-foreground"
                    : t.disabled
                      ? "border-transparent text-muted-foreground/45 cursor-not-allowed"
                      : "border-foreground/15 text-muted-foreground hover:text-foreground hover:border-foreground/40"
                )}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                {t.disabled && <Lock className="w-3 h-3 opacity-70" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tab: Import DB ───────────────────────────────────────────────── */}
      {tab === "import" && (
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-xl mx-auto space-y-5">

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300 space-y-1">
              <div className="font-semibold flex items-center gap-2"><Database className="w-4 h-4" /> Import Enriched Outreach XLSX → Database</div>
              <p className="text-xs leading-relaxed">
                Upload <strong>SVS_Fund_II_Enriched_Outreach_282.xlsx</strong> (or any same-format enriched outreach file)
                to import all 282 LP profiles, email drafts, and LinkedIn DMs directly into your CRM and Outreach
                campaign. The import is idempotent — re-uploading updates existing rows.
              </p>
              <ul className="text-xs list-disc list-inside space-y-0.5 text-blue-700 dark:text-blue-300 mt-1">
                <li>Creates <strong>crm_entries</strong> for all LP profiles (visible in CRM page)</li>
                <li>Creates an <strong>outreach campaign</strong> with all 282 members</li>
                <li>Stores <strong>email drafts</strong> and <strong>LinkedIn DMs</strong> as outreach messages</li>
                <li>Sets outreach status, tier, score, research summary on each CRM row</li>
              </ul>
            </div>

            {/* Campaign name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Campaign name</label>
              <input
                value={importCampaignName}
                onChange={(e) => setImportCampaignName(e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* File drop */}
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-500/10/30 transition-all"
              onClick={() => importFileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setImportFile(f) }}
            >
              <FileSpreadsheet className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              {importFile ? (
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{importFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(importFile.size / 1024).toFixed(0)} KB — ready to import</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Drop your enriched outreach .xlsx here</p>
                  <p className="text-xs text-muted-foreground">Sheets needed: Curated Profiles (Enriched) · Email Drafts (Enriched) · LinkedIn DMs</p>
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
                importResult.ok ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
              )}>
                {importResult.ok ? (
                  <>
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold">
                      <CheckCircle2 className="w-5 h-5" /> Import complete
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-card rounded-lg border border-green-500/30 px-3 py-2">
                        <div className="text-xl font-bold text-green-700 dark:text-green-300">{(importResult.stats?.crmInserted ?? 0) + (importResult.stats?.crmUpdated ?? 0)}</div>
                        <div className="text-xs text-muted-foreground">CRM entries ({importResult.stats?.crmInserted} new · {importResult.stats?.crmUpdated} updated)</div>
                      </div>
                      <div className="bg-card rounded-lg border border-green-500/30 px-3 py-2">
                        <div className="text-xl font-bold text-green-700 dark:text-green-300">{importResult.stats?.members}</div>
                        <div className="text-xs text-muted-foreground">Campaign members</div>
                      </div>
                      <div className="bg-card rounded-lg border border-green-500/30 px-3 py-2">
                        <div className="text-xl font-bold text-green-700 dark:text-green-300">{importResult.stats?.messages}</div>
                        <div className="text-xs text-muted-foreground">Outreach messages (email + DM)</div>
                      </div>
                      <div className="bg-card rounded-lg border border-green-500/30 px-3 py-2 col-span-1">
                        <div className="text-xs font-medium text-foreground truncate">{importResult.campaignName}</div>
                        <div className="text-xs text-muted-foreground">Campaign created</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href="/dashboard/outreach"
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Open in Outreach
                      </a>
                      <a
                        href="/dashboard/crm"
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-2 border border-border text-foreground rounded-lg hover:bg-muted/40"
                      >
                        <Users className="w-3.5 h-3.5" /> Open in CRM
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
                    <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium">Import failed</div>
                      <div className="text-xs font-mono mt-1">{importResult.error}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground text-center">
              Prefer CLI? Run: <code className="bg-muted px-1.5 py-0.5 rounded font-mono">node scripts/import-svs-campaign.mjs &lt;path.xlsx&gt;</code>
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
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-500/10/30 transition-all"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium text-foreground">Drop an LP list here</p>
              <p className="text-sm text-muted-foreground mt-1">
                Accepts <strong>.xlsx</strong> or <strong>.csv</strong> with any column shape. The first non-empty sheet is auto-picked. Headers are fuzzy-matched (Name / Firm / Company; Sectors / Thesis; Country / Ctry / Geo; etc).
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1 border-t border-border" />
              or paste CSV data below
              <div className="flex-1 border-t border-border" />
            </div>

            {/* CSV paste area */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Paste CSV rows</label>
              <p className="text-xs text-muted-foreground">
                Column headers are auto-detected. We&apos;ll look for any of these by name (or close variants):{" "}
                <code className="bg-muted px-1 rounded">Name / Firm / Company</code>,{" "}
                <code className="bg-muted px-1 rounded">Email</code>,{" "}
                <code className="bg-muted px-1 rounded">LinkedIn</code>,{" "}
                <code className="bg-muted px-1 rounded">Sectors / Thesis</code>,{" "}
                <code className="bg-muted px-1 rounded">Location / Ctry / Geo</code>,{" "}
                <code className="bg-muted px-1 rounded">Website</code>, ...
              </p>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={8}
                className="w-full text-xs font-mono border border-border rounded-lg p-3 bg-card resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="#,Tier,Score,Name,Title/Role,LP Type,Tags,Location,Email,LinkedIn,Sectors,Why This Contact..."
              />
              <Button onClick={handleParse} variant="outline" size="sm">Parse CSV</Button>
            </div>

            {parseError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {parseError}
              </div>
            )}

            {/* ── Detected-mapping panel ─────────────────────────────────── */}
            {(parsedProfiles.length > 0 || Object.keys(detectedColumns).length > 0) && (
              <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-foreground">
                    Auto-detected columns{parseSourceLabel ? ` · ${parseSourceLabel}` : ""}
                  </div>
                  {droppedCount > 0 && (
                    <div className="text-amber-700 dark:text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded">
                      {droppedCount} row(s) skipped (no name / email / linkedin)
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {([
                    ["Name",      "name"],
                    ["Email",     "email"],
                    ["LinkedIn",  "linkedin"],
                    ["Title/Role","titleRole"],
                    ["LP Type",   "lpType"],
                    ["Location",  "location"],
                    ["Sectors",   "sectors"],
                    ["Score",     "score"],
                    ["Website",   "inferredWebsite"],
                    ["Why",       "whyThisContact"],
                  ] as Array<[string, CanonicalField]>).map(([label, key]) => {
                    const src = detectedColumns[key]
                    return (
                      <div key={key} className="flex items-center gap-2 min-w-0">
                        <span className="text-muted-foreground w-24 flex-shrink-0">{label}</span>
                        <span className="text-muted-foreground">←</span>
                        {src ? (
                          <code className="bg-card border border-border text-foreground px-1.5 py-0.5 rounded truncate">{src}</code>
                        ) : (
                          <span className="text-muted-foreground italic">(not found)</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="text-muted-foreground leading-relaxed pt-1 border-t border-border">
                  Don&apos;t see the mapping you expected? Rename your column header to match, or paste the header your file uses into the CSV box (we&apos;ll re-detect on re-parse). Other columns are still kept and forwarded to enrichment.
                </p>
              </div>
            )}

            {parsedProfiles.length > 0 && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-medium">
                    <Check className="w-4 h-4" />
                    {parsedProfiles.length} profiles ready
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setParsedProfiles([])} className="text-muted-foreground h-7 px-2">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Quick preview */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {parsedProfiles.slice(0, 3).map((p) => (
                    <div key={p.id} className="bg-card rounded-lg border border-green-500/30 p-2.5">
                      <div className="font-medium text-foreground truncate">{p.name}</div>
                      <div className="text-muted-foreground truncate">{p.lpType}</div>
                      <div className="text-muted-foreground truncate">{p.email}</div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={handleRun} disabled={running} className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Run Campaign ({parsedProfiles.length} profiles, {Math.ceil(parsedProfiles.length / 10)} batches)
                  </Button>
                  <p className="text-xs text-muted-foreground">
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
              <div className="text-center text-sm text-muted-foreground">
                Batch {progress.batchNum} of {progress.batchTotal}
                <span className="text-muted-foreground ml-1">(≤10 profiles per batch, 2s gap between)</span>
              </div>
            )}

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-foreground">
                  {running ? `Enriching ${progress.name || "…"}` : result ? "Complete" : "Waiting"}
                </span>
                <span className="text-muted-foreground">{progress.done}/{progress.total}</span>
              </div>
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-right text-xs text-muted-foreground">{pct}%</div>
            </div>

            {/* Live name ticker */}
            {running && progress.name && (
              <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                Enriching <strong>{progress.name}</strong>…
              </div>
            )}

            {/* Error */}
            {streamError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Pipeline error</div>
                  <div className="text-xs mt-0.5 font-mono">{streamError}</div>
                </div>
              </div>
            )}

            {/* Done state */}
            {result && !running && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5 text-center space-y-3">
                <div className="text-green-700 dark:text-green-300 font-semibold text-lg flex items-center justify-center gap-2">
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
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
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
          <div className="sticky top-0 z-10 bg-card border-b border-border px-5 py-3 space-y-2.5">
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
                className={cn("text-xs px-2.5 py-1 rounded-full border font-medium transition-all", filterType === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted/40")}
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
                    className={cn("text-xs px-2.5 py-1 rounded-full border font-medium transition-all", filterType === t ? cn(ts.bg, ts.text, ts.border, "ring-1 ring-current") : cn("bg-card text-muted-foreground border-border hover:bg-muted/40"))}
                  >
                    {t} <span className="ml-0.5 opacity-70">{count}</span>
                  </button>
                )
              })}
              <div className="flex-1" />
              <label className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={showMtOnly} onChange={(e) => setShowMtOnly(e.target.checked)} className="rounded" />
                Multi-touch only
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground"
              >
                <option value="score">Score ↓</option>
                <option value="name">Name A→Z</option>
                <option value="tier">Tier</option>
              </select>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
              <div className="text-center py-16 text-muted-foreground">No profiles match your filters.</div>
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
            <h2 className="text-base font-semibold text-foreground">Export campaign outputs</h2>

            {/* Stats summary */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="Total LPs" value={result.stats.total} />
              <StatCard label="Avg Score" value={result.stats.avgScore} />
              <StatCard label="Batches" value={result.stats.batches} />
              <StatCard label="Multi-Touch" value={result.stats.multiTouchCount} />
            </div>

            {/* LP type breakdown */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" /> LP Type Breakdown
              </div>
              {Object.entries(result.stats.byLPType).sort((a, b) => b[1] - a[1]).map(([t, c]) => {
                const ts = typeStyle(t)
                return (
                  <div key={t} className="flex items-center gap-2">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium w-44 truncate", ts.bg, ts.text, ts.border)}>{t}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round(c / result.stats.total * 100)}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{c}</span>
                  </div>
                )
              })}
            </div>

            {/* Channel breakdown */}
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Primary Channel
              </div>
              <div className="flex gap-3">
                {Object.entries(result.stats.byChannel).filter(([, v]) => v > 0).map(([ch, c]) => (
                  <div key={ch} className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-lg px-3 py-2">
                    {ch === "linkedin" ? <Linkedin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> : <Mail className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className="text-sm font-semibold">{c}</span>
                    <span className="text-xs text-muted-foreground capitalize">{ch}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Download buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={downloadXlsx}
                className="flex flex-col items-center gap-2 bg-card border border-border rounded-xl p-5 hover:border-blue-300 hover:bg-blue-500/10/30 transition-all text-left"
              >
                <FileSpreadsheet className="w-7 h-7 text-green-600 dark:text-green-400" />
                <div>
                  <div className="font-semibold text-foreground">Excel Workbook</div>
                  <div className="text-xs text-muted-foreground mt-0.5">6 sheets: Enriched Profiles, Email Drafts, LinkedIn DMs, Summary, Multi-Touch, Methodology</div>
                </div>
                <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium mt-1">
                  <Download className="w-3.5 h-3.5" /> Download .xlsx
                </div>
              </button>

              <button
                onClick={downloadHtml}
                className="flex flex-col items-center gap-2 bg-card border border-border rounded-xl p-5 hover:border-blue-300 hover:bg-blue-500/10/30 transition-all text-left"
              >
                <Globe className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                <div>
                  <div className="font-semibold text-foreground">HTML Review UI</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Self-contained page with expandable cards, filter pills, copy buttons — open in any browser</div>
                </div>
                <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium mt-1">
                  <Download className="w-3.5 h-3.5" /> Download .html
                </div>
              </button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Generated {new Date(result.generatedAt).toLocaleString()} · Drafts only — no auto-send
            </p>
          </div>
        </div>
      )}

      {/* Fallback for disabled tabs */}
      {(tab === "review" || tab === "export") && !result && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Run the pipeline first to see results here.
        </div>
      )}
    </div>
  )
}

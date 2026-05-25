"use client"

/**
 * OutreachStudio — the integrated "select investor → research → draft" panel.
 *
 * Three steps, top to bottom:
 *   1. Research the investor  — webcrawl their public page + AI brief
 *                               (cached on the crm row as research_summary)
 *   2. Your sender profile    — build/select a reusable profile of the
 *                               sender from the founder "profile set" +
 *                               a pasted professional summary
 *   3. Draft outreach         — AI drafts an intro EMAIL (subject+body) and
 *                               a LinkedIn DM, personalized with 1 + 2.
 *
 * Draft-only. Nothing is ever auto-sent — copy buttons + the existing
 * approve/send flow handle delivery.
 */

import { useEffect, useState, useTransition } from "react"
import {
  X, Loader2, Globe, Sparkles, Save, Copy, Check, AlertTriangle,
  User, Mail, Linkedin, FileText, Building2, Star,
} from "lucide-react"
import type { FounderCtx } from "./founder-context-card"

export interface StudioEntry {
  id: string
  displayName: string
  displayTitle: string | null
  displayType: string | null
  displayLocation: string | null
  displayLinkedin: string | null
  displayEmail: string | null
  whyMatch: string | null
  researchSummary?: string | null
  researchUrl?: string | null
  stage: string
}

interface SenderProfile {
  id: string
  name: string
  rawSummary: string
  builtProfile: string
  generatedBy: string | null
  isDefault: boolean
}

interface Draft {
  id: string
  kind: string
  channel: string
  subject?: string | null
  body: string
  char_count?: number
  status: string
}

interface Props {
  entry: StudioEntry
  founder: FounderCtx
  onClose: () => void
  onAfterChange?: () => void
}

const NEW_PROFILE = "__new__"

export function OutreachStudio({ entry, founder, onClose, onAfterChange }: Props) {
  // ─── step 1: research ──────────────────────────────────────────────
  const [crawlUrl, setCrawlUrl] = useState(entry.displayLinkedin ?? entry.researchUrl ?? "")
  const [research, setResearch] = useState(entry.researchSummary ?? "")
  const [researchMeta, setResearchMeta] = useState<{ provider?: string; note?: string | null; crawled?: boolean } | null>(null)
  const [crawling, startCrawl] = useTransition()

  // ─── step 2: sender profile ────────────────────────────────────────
  const [profiles, setProfiles] = useState<SenderProfile[]>([])
  const [selectedId, setSelectedId] = useState<string>(NEW_PROFILE)
  const [profName, setProfName] = useState(founder.founderName ? `${founder.founderName}'s profile` : "My profile")
  const [profSummary, setProfSummary] = useState("")
  const [builtProfile, setBuiltProfile] = useState("")
  const [makeDefault, setMakeDefault] = useState(false)
  const [building, startBuild] = useTransition()

  // ─── step 3: drafts ────────────────────────────────────────────────
  const [email, setEmail] = useState<Draft | null>(null)
  const [dm, setDm] = useState<Draft | null>(null)
  const [emailSubject, setEmailSubject] = useState("")
  const [emailBody, setEmailBody] = useState("")
  const [dmBody, setDmBody] = useState("")
  const [drafting, startDraft] = useTransition()
  const [draftProvider, setDraftProvider] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<"email" | "dm" | null>(null)

  // Load saved sender profiles + existing drafts on open.
  useEffect(() => {
    void loadProfiles()
    void loadDrafts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id])

  async function loadProfiles() {
    try {
      const res = await fetch("/api/outreach/sender-profile")
      if (!res.ok) return
      const data = await res.json()
      const list: SenderProfile[] = data?.profiles ?? []
      setProfiles(list)
      const def = list.find((p) => p.isDefault) ?? list[0]
      if (def) {
        setSelectedId(def.id)
        setProfName(def.name)
        setProfSummary(def.rawSummary)
        setBuiltProfile(def.builtProfile)
      }
    } catch {/* ignore */}
  }

  async function loadDrafts() {
    try {
      const res = await fetch(`/api/outreach/messages?crmEntryId=${entry.id}`)
      if (!res.ok) return
      const data = await res.json()
      const msgs: Draft[] = data?.messages ?? []
      const e = msgs.find((m) => m.kind === "email_intro")
      const d = msgs.find((m) => m.kind === "dm_intro")
      if (e) { setEmail(e); setEmailSubject(e.subject ?? ""); setEmailBody(e.body) }
      if (d) { setDm(d); setDmBody(d.body) }
    } catch {/* ignore */}
  }

  function onSelectProfile(id: string) {
    setSelectedId(id)
    setError(null)
    if (id === NEW_PROFILE) {
      setProfName(founder.founderName ? `${founder.founderName}'s profile` : "My profile")
      setProfSummary("")
      setBuiltProfile("")
      setMakeDefault(false)
      return
    }
    const p = profiles.find((x) => x.id === id)
    if (p) {
      setProfName(p.name)
      setProfSummary(p.rawSummary)
      setBuiltProfile(p.builtProfile)
      setMakeDefault(p.isDefault)
    }
  }

  // ─── actions ───────────────────────────────────────────────────────
  function runCrawl() {
    setError(null)
    startCrawl(async () => {
      try {
        const res = await fetch("/api/outreach/crawl-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crmEntryId: entry.id, url: crawlUrl || undefined }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? `Crawl failed (${res.status})`)
        setResearch(data.summary ?? "")
        setResearchMeta({ provider: data.provider, note: data.note, crawled: data.crawled })
        onAfterChange?.()
      } catch (e: any) {
        setError(e?.message ?? "Crawl failed")
      }
    })
  }

  function buildProfile() {
    if (!profSummary.trim() && !founder.companyName) {
      setError("Add a professional summary (or fill in 'Your context for outreach') before building.")
      return
    }
    setError(null)
    startBuild(async () => {
      try {
        const res = await fetch("/api/outreach/sender-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedId === NEW_PROFILE ? undefined : selectedId,
            name: profName,
            summary: profSummary,
            founder,
            makeDefault,
            rebuild: true,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? `Build failed (${res.status})`)
        const p: SenderProfile = data.profile
        setBuiltProfile(p.builtProfile)
        setSelectedId(p.id)
        await loadProfiles()
        setSelectedId(p.id)
        onAfterChange?.()
      } catch (e: any) {
        setError(e?.message ?? "Build failed")
      }
    })
  }

  function draft() {
    if (!builtProfile && !founder.companyName) {
      setError("Build a sender profile or fill in your founder context first.")
      return
    }
    setError(null)
    startDraft(async () => {
      try {
        const res = await fetch("/api/outreach/draft-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            crmEntryId: entry.id,
            senderProfileId: selectedId === NEW_PROFILE ? undefined : selectedId,
            founder,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? `Draft failed (${res.status})`)
        setDraftProvider(data.provider ?? null)
        if (data.email) { setEmail(data.email); setEmailSubject(data.email.subject ?? ""); setEmailBody(data.email.body ?? "") }
        if (data.dm) { setDm(data.dm); setDmBody(data.dm.body ?? "") }
        if (data.aiError) setError(`AI unavailable (${data.aiError}); used a template draft you can edit.`)
        onAfterChange?.()
      } catch (e: any) {
        setError(e?.message ?? "Draft failed")
      }
    })
  }

  async function saveEmail() {
    if (!email) return
    try {
      const res = await fetch(`/api/outreach/messages/${email.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: emailSubject, body: emailBody }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error ?? "Save failed") }
      onAfterChange?.()
    } catch (e: any) { setError(e?.message ?? "Save failed") }
  }

  async function saveDm() {
    if (!dm) return
    try {
      const res = await fetch(`/api/outreach/messages/${dm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: dmBody }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error ?? "Save failed") }
      onAfterChange?.()
    } catch (e: any) { setError(e?.message ?? "Save failed") }
  }

  async function copy(kind: "email" | "dm") {
    const text = kind === "email" ? `Subject: ${emailSubject}\n\n${emailBody}` : dmBody
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied(null), 1500)
    } catch {/* ignore */}
  }

  const founderReady = !!(founder.companyName && founder.oneLiner)
  const emailDirty = !!email && (emailSubject !== (email.subject ?? "") || emailBody !== email.body)
  const dmDirty = !!dm && dmBody !== dm.body
  const dmTooLong = dmBody.length > 300

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="fixed inset-0 bg-black/30" />
      <div
        className="relative w-[720px] max-w-full bg-background border-l border-foreground/10 h-full overflow-y-auto z-50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-foreground/10 flex items-start justify-between gap-4 sticky top-0 bg-background z-10">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
              <Sparkles className="w-3 h-3" /> Outreach studio
            </div>
            <h2 className="font-display text-xl leading-tight">{entry.displayName}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
              {entry.displayTitle && <span>{entry.displayTitle}</span>}
              {entry.displayType && <span className="font-mono">{entry.displayType}</span>}
              {entry.displayLocation && <span>{entry.displayLocation}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="text-amber-800 dark:text-amber-300">{error}</span>
            </div>
          )}
          {!founderReady && (
            <div className="text-[11px] text-muted-foreground border border-dashed border-foreground/15 rounded-md p-3">
              Tip: fill in <span className="font-medium">“Your context for outreach”</span> (company + one-liner) on the CRM page so the AI can personalize as you. Your profile set is read from there.
            </div>
          )}

          {/* ─── STEP 1 — Research ─── */}
          <Section n={1} title="Research the investor" icon={Globe}>
            <label className="text-[11px] text-muted-foreground">Profile / website URL to crawl</label>
            <div className="flex gap-2 mt-1">
              <input
                type="url"
                value={crawlUrl}
                onChange={(e) => setCrawlUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/… or firm website"
                className="flex-1 px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
              <button
                type="button"
                onClick={runCrawl}
                disabled={crawling}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-foreground text-background text-sm hover:bg-foreground/90 disabled:opacity-50 shrink-0"
              >
                {crawling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                {research ? "Re-crawl" : "Webcrawl + summarize"}
              </button>
            </div>
            {(research || researchMeta) && (
              <div className="mt-3 border border-foreground/10 rounded-md p-3 bg-foreground/[0.02]">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                  <FileText className="w-3 h-3" /> Research brief
                  {researchMeta?.provider && <span>· via {researchMeta.provider}</span>}
                  {researchMeta && researchMeta.crawled === false && <span className="text-amber-600">· crawl thin</span>}
                </div>
                <textarea
                  value={research}
                  onChange={(e) => setResearch(e.target.value)}
                  rows={5}
                  className="w-full text-sm leading-relaxed bg-transparent resize-y focus:outline-none"
                />
                {researchMeta?.note && (
                  <div className="text-[10px] text-muted-foreground mt-1">{researchMeta.note}</div>
                )}
              </div>
            )}
            {entry.whyMatch && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                <span className="font-medium">Why matched:</span> {entry.whyMatch}
              </div>
            )}
          </Section>

          {/* ─── STEP 2 — Sender profile ─── */}
          <Section n={2} title="Build your sender profile" icon={User}>
            <div className="flex gap-2 items-center">
              <select
                value={selectedId}
                onChange={(e) => onSelectProfile(e.target.value)}
                className="h-9 px-2 text-sm border border-foreground/15 rounded-md bg-background"
              >
                <option value={NEW_PROFILE}>+ New profile</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.isDefault ? " ★" : ""}</option>
                ))}
              </select>
              <input
                type="text"
                value={profName}
                onChange={(e) => setProfName(e.target.value)}
                placeholder="Profile name"
                className="flex-1 h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </div>

            {/* Profile set (from founder context) */}
            <div className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground border border-foreground/10 rounded-md p-2 bg-foreground/[0.02]">
              <Building2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium text-foreground/80">Profile set</span> (from your outreach context):{" "}
                {founder.companyName ? <span>{founder.companyName}</span> : <span className="italic">no company set</span>}
                {founder.oneLiner ? <> — {founder.oneLiner}</> : null}
              </div>
            </div>

            <label className="block text-[11px] text-muted-foreground mt-3">Paste a professional summary of the sender</label>
            <textarea
              value={profSummary}
              onChange={(e) => setProfSummary(e.target.value)}
              rows={4}
              placeholder="e.g. 2x founder, prior exit to Stripe; 8 yrs in payments infra; led eng at Plaid; angel-backed by…"
              className="mt-1 w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
            />
            <div className="flex items-center justify-between mt-2">
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
                <Star className="w-3 h-3" /> set as default
              </label>
              <button
                type="button"
                onClick={buildProfile}
                disabled={building}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-foreground/15 text-sm hover:bg-foreground/5 disabled:opacity-50"
              >
                {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Build &amp; save profile
              </button>
            </div>
            {builtProfile && (
              <div className="mt-3 border border-foreground/10 rounded-md p-3 bg-foreground/[0.02] text-sm leading-relaxed whitespace-pre-wrap">
                {builtProfile}
              </div>
            )}
          </Section>

          {/* ─── STEP 3 — Draft ─── */}
          <Section n={3} title="Draft outreach" icon={Mail}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={draft}
                disabled={drafting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-sm hover:bg-foreground/90 disabled:opacity-50"
              >
                {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {email || dm ? "Regenerate email + DM" : "Draft email + LinkedIn DM"}
              </button>
              {draftProvider && <span className="text-[10px] font-mono text-muted-foreground">via {draftProvider}</span>}
            </div>

            {/* Email draft */}
            {email && (
              <div className="mt-4 border border-foreground/10 rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    <Mail className="w-3 h-3" /> Intro email
                    <span className="px-1.5 py-0.5 rounded bg-foreground/5">{email.status}</span>
                  </div>
                  <button onClick={() => copy("email")} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                    {copied === "email" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} copy
                  </button>
                </div>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background mb-2 font-medium"
                />
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background leading-relaxed"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] font-mono text-muted-foreground">{emailBody.length} chars{entry.displayEmail ? ` · to ${entry.displayEmail}` : ""}</span>
                  {emailDirty && (
                    <button onClick={saveEmail} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-foreground/15 hover:bg-foreground/5">
                      <Save className="w-3 h-3" /> Save edits
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* DM draft */}
            {dm && (
              <div className="mt-3 border border-foreground/10 rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    <Linkedin className="w-3 h-3" /> LinkedIn DM
                    <span className="px-1.5 py-0.5 rounded bg-foreground/5">{dm.status}</span>
                  </div>
                  <button onClick={() => copy("dm")} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                    {copied === "dm" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} copy
                  </button>
                </div>
                <textarea
                  value={dmBody}
                  onChange={(e) => setDmBody(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background leading-relaxed"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-[10px] font-mono ${dmTooLong ? "text-rose-600" : "text-muted-foreground"}`}>{dmBody.length} / 300</span>
                  {dmDirty && (
                    <button onClick={saveDm} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-foreground/15 hover:bg-foreground/5">
                      <Save className="w-3 h-3" /> Save edits
                    </button>
                  )}
                </div>
              </div>
            )}

            {(email || dm) && (
              <p className="mt-3 text-[10px] text-muted-foreground">
                Drafts only — nothing is sent automatically. Copy into your email client / LinkedIn, or approve in the composer to queue.
              </p>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ n, title, icon: Icon, children }: {
  n: number
  title: string
  icon: any
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-6 h-6 rounded-full bg-foreground text-background text-xs font-mono flex items-center justify-center shrink-0">{n}</span>
        <h3 className="font-display text-lg flex items-center gap-2"><Icon className="w-4 h-4 text-muted-foreground" /> {title}</h3>
      </div>
      <div className="pl-8">{children}</div>
    </div>
  )
}

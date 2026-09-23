"use client"

import { useEffect, useId, useRef, useState, useTransition } from "react"
import { deckUploadError, MAX_DECK_BYTES } from "@/lib/matching/deck-upload"
import { startupReadiness, fillEmpty, responseError } from "@/lib/matching/profile-readiness"
import { MatchingReadiness } from "./matching-readiness"
import { useFindInvestorsWebMcp } from "@/components/webmcp/find-investors-tools"
import {
  Upload,
  FileText,
  Sparkles,
  Loader2,
  Wand2,
  Plus,
  X,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Check,
  Target,
  Layers,
  Mail,
  Download,
  Trash2,
  Play,
  Trophy,
} from "lucide-react"
import { AiStatusBadge, type AiProvider } from "./ai-status-badge"
import { PageHeader } from "@/components/shell/page-header"
import { ThesisEnrichDialog } from "./thesis-enrich-dialog"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { ShortlistUploader } from "@/components/tesseract/shortlist-uploader"
import { MatchResults, Deliverables } from "@/components/tesseract/match-results"

const STAGE_OPTIONS = [
  { v: "pre-seed", l: "Pre-seed" },
  { v: "seed", l: "Seed" },
  { v: "series-a", l: "Series A" },
  { v: "series-b", l: "Series B" },
  { v: "series-c", l: "Series C" },
  { v: "growth", l: "Growth" },
  { v: "late-stage", l: "Late stage" },
]

const TIERS = [
  { id: "champion", label: "Champion (80+)", color: "oklch(0.70 0.15 150)" },
  { id: "priority_a", label: "Priority A (60-79)", color: "oklch(0.78 0.14 75)" },
  { id: "priority_b", label: "Priority B (40-59)", color: "oklch(0.55 0.15 200)" },
  { id: "prospect_c", label: "Prospect C (20-39)", color: "oklch(0.45 0.05 270)" },
]

const SEGMENTS: { v: string; l: string }[] = [
  { v: "lead", l: "Lead Candidates" },
  { v: "warm_local", l: "Local + Sector Match" },
  { v: "follow_on", l: "Follow-on" },
  { v: "stage_match", l: "Stage Match" },
  { v: "sector_match", l: "Sector Match" },
  { v: "active_recent", l: "Recently Active" },
  { v: "international", l: "International" },
]

interface StartupForm {
  name: string
  oneLiner: string
  description: string
  primarySector: string
  sectorsCsv: string
  stage: string
  location: string
  askAmount: string // input as M (millions)
  preMoneyValuation: string // input as M
  checkSizeIdealMin: string // M
  checkSizeIdealMax: string // M
  arr: string // K
  mrr: string // K
  growthRateMom: string
  teamSize: string
  foundedYear: string
  thesisCsv: string
  // Round terms and status
  instrument: string
  valuationCap: string        // M
  valuationCapType: string
  leadStatus: string
  committedAmount: string     // M
  targetCloseDate: string
  // Targeting
  targetRegionsCsv: string
  wantedTypesCsv: string
  excludedTypesCsv: string
  excludedInvestorsCsv: string
  // Company context
  businessModel: string
  customerSegment: string
  namedCustomersCsv: string
  useOfFunds: string
  competitorsCsv: string
}

const EMPTY_FORM: StartupForm = {
  name: "",
  oneLiner: "",
  description: "",
  primarySector: "",
  sectorsCsv: "",
  stage: "",
  location: "",
  askAmount: "",
  preMoneyValuation: "",
  checkSizeIdealMin: "",
  checkSizeIdealMax: "",
  arr: "",
  mrr: "",
  growthRateMom: "",
  teamSize: "",
  foundedYear: "",
  thesisCsv: "",
  instrument: "",
  valuationCap: "",
  valuationCapType: "post-money",
  leadStatus: "",
  committedAmount: "",
  targetCloseDate: "",
  targetRegionsCsv: "",
  wantedTypesCsv: "",
  excludedTypesCsv: "",
  excludedInvestorsCsv: "",
  businessModel: "",
  customerSegment: "",
  namedCustomersCsv: "",
  useOfFunds: "",
  competitorsCsv: "",
}

interface RunResult {
  sessionId: string
  runId?: string
  startupName: string
  durationMs: number
  engineVersion?: string
  totals: any
  qualifiedBeforeCap?: { groups: number; independents: number }
  tierCounts: any
  segmentCounts: any
  funnel: any
  semantic?: { status: string; reason: string | null }
  exclusions?: Record<string, number>
  emailVerification?: { provider: number; providerConfigured: boolean }
  topGroups?: any[]
  topIndependents?: any[]
  topFirms: any[]
  topContacts: any[]
}

export function FindInvestorsContent({ aiAvailable, companyDefaults }: { aiAvailable: boolean; companyDefaults?: Partial<StartupForm> }) {
  const [pitchDeck, setPitchDeck] = useState<File | null>(null)

  useFindInvestorsWebMcp({
    onSearch: async ({ sector, stage, geo }: { sector?: string; stage?: string; geo?: string }) => {
      setForm((prev: any) => ({
        ...prev,
        ...(sector ? { primarySector: sector } : {}),
        ...(stage ? { stage } : {}),
        ...(geo ? { location: geo } : {}),
      }))
      return { ok: true }
    },
    onAddToShortlist: async (id: string, board: string) => {
      const match = [...(latest?.topFirms ?? []), ...(latest?.topContacts ?? [])].find(item => item.id === id)
      if (!match) return { ok: false, msg: "Run matching and choose an investor from the results first." }
      const r = await fetch("/api/crm/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investorId: match.kind === "person" ? id : null, firmId: match.kind === "firm" ? id : null, boardId: board, displayName: match.name, displayEmail: match.email, sourceSessionId: latest?.sessionId, source: "founder_matching", whyMatch: match.whyMatch }),
      })
      if (!r.ok) return { ok: false, msg: `HTTP ${r.status}` }
      return { ok: true }
    },
  })
  const [dataRoom, setDataRoom] = useState<File[]>([])
  const [extracting, startExtracting] = useTransition()
  const [matching, startMatching] = useTransition()
  const [analyzing, startAnalyzing] = useTransition()
  const [extractError, setExtractError] = useState<string | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [aiNotes, setAiNotes] = useState<string | null>(null)
  const [confidence, setConfidence] = useState<number | null>(null)
  const [deckScores, setDeckScores] = useState<any | null>(null)
  const [form, setForm] = useState<StartupForm>(() => ({ ...EMPTY_FORM, ...companyDefaults }))
  const [extracted, setExtracted] = useState<Record<string, any> | null>(null)
  const [provenance, setProvenance] = useState<Record<string, string>>({})
  const [deckUrl, setDeckUrl] = useState("")
  const [enableAi, setEnableAi] = useState(true)
  const [runs, setRuns] = useState<{ id: string; createdAt: string; groups: number; independents: number }[]>([])
  const [minScore, setMinScore] = useState(40)
  const [latest, setLatest] = useState<RunResult | null>(null)
  const [aiOverride, setAiOverride] = useState<AiProvider | "auto">("auto")
  const [thesisDialogOpen, setThesisDialogOpen] = useState(false)

  const missing = startupReadiness(formToProfile(form))
  useEffect(() => { setLatest(null) }, [form, minScore])

  // The profile and past runs belong to the workspace, not to this browser tab.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [profileRes, runsRes] = await Promise.all([fetch("/api/founder/profile"), fetch("/api/founder/matching/runs")])
        if (cancelled) return
        if (profileRes.ok) {
          const { profile } = await profileRes.json()
          if (profile?.fields) {
            setForm((prev) => fillEmpty(prev, profileToForm(profile.fields)))
            setProvenance((prev) => ({ ...profile.provenance, ...prev }))
            setExtracted((prev) => prev ?? profile.fields)
          }
        }
        if (runsRes.ok) {
          const { runs: history } = await runsRes.json()
          if (Array.isArray(history)) setRuns(history)
        }
      } catch { /* the page still works without them */ }
    })()
    return () => { cancelled = true }
  }, [])
  const dataRoomInputRef = useRef<HTMLInputElement>(null)

  /** Decks above the request limit go straight to Blob storage, privately. */
  const uploadLarge = async (file: File): Promise<string> => {
    const { upload } = await import("@vercel/blob/client")
    const blob = await upload(`founder-decks/${crypto.randomUUID()}/${file.name}`, file, {
      access: "private" as any, handleUploadUrl: "/api/founder/deck-upload", contentType: file.type || undefined,
    })
    return blob.url
  }

  const onExtract = () => {
    if (!pitchDeck && dataRoom.length === 0 && !deckUrl.trim()) {
      setExtractError("Add a pitch deck, paste a link to one, or attach a data-room file first.")
      return
    }
    const viaBlob = !!pitchDeck && pitchDeck.size > MAX_DECK_BYTES
    const problem = deckUploadError([...(pitchDeck ? [pitchDeck] : []), ...dataRoom], { viaBlob })
    if (problem) { setExtractError(problem); return }
    setExtractError(null)
    setAiNotes(null)
    startExtracting(async () => {
      try {
        const fd = new FormData()
        if (pitchDeck && !viaBlob) fd.append("pitch_deck", pitchDeck)
        if (pitchDeck && viaBlob) fd.append("blob_urls", await uploadLarge(pitchDeck))
        for (const f of dataRoom) fd.append("data_room", f)
        if (deckUrl.trim()) fd.append("deck_url", deckUrl.trim())
        if (form.name) fd.append("startup_name", form.name)

        const res = await fetch("/api/founder/extract-profile", {
          method: "POST",
          body: fd,
        })
        if (!res.ok) {
          throw new Error(await responseError(res, "Request failed"))
        }
        const json = await res.json()
        const { fields, ai } = json
        applyExtractedFields(fields)
        setAiNotes(["Empty fields were filled. Review the extracted values; your existing entries were kept.", fields.notes].filter(Boolean).join(" "))
        setConfidence(typeof fields.confidence === "number" ? fields.confidence : null)
      } catch (e: any) {
        setExtractError(e?.message ?? "Extraction failed")
      }
    })
  }

  const applyExtractedFields = (f: any) => {
    setForm((prev) => fillEmpty(prev, {
      name: f.name ?? prev.name,
      oneLiner: f.oneLiner ?? prev.oneLiner,
      description: f.description ?? prev.description,
      primarySector: f.primarySector ?? prev.primarySector,
      sectorsCsv: Array.isArray(f.sectors) ? f.sectors.join(", ") : prev.sectorsCsv,
      stage: f.stage ?? prev.stage,
      location: f.location ?? prev.location,
      askAmount: typeof f.askAmount === "number" ? toM(f.askAmount) : prev.askAmount,
      preMoneyValuation: typeof f.preMoneyValuation === "number" ? toM(f.preMoneyValuation) : prev.preMoneyValuation,
      checkSizeIdealMin: typeof f.checkSizeIdealMin === "number" ? toM(f.checkSizeIdealMin) : prev.checkSizeIdealMin,
      checkSizeIdealMax: typeof f.checkSizeIdealMax === "number" ? toM(f.checkSizeIdealMax) : prev.checkSizeIdealMax,
      arr: typeof f.arr === "number" ? toK(f.arr) : prev.arr,
      mrr: typeof f.mrr === "number" ? toK(f.mrr) : prev.mrr,
      growthRateMom: typeof f.growthRateMom === "number" ? String(f.growthRateMom) : prev.growthRateMom,
      teamSize: typeof f.teamSize === "number" ? String(f.teamSize) : prev.teamSize,
      foundedYear: typeof f.foundedYear === "number" ? String(f.foundedYear) : prev.foundedYear,
      thesisCsv: Array.isArray(f.thesisKeywords) ? f.thesisKeywords.join(", ") : prev.thesisCsv,
      instrument: f.instrument ?? prev.instrument,
      valuationCap: typeof f.valuationCap === "number" ? toM(f.valuationCap) : prev.valuationCap,
      valuationCapType: f.valuationCapType ?? prev.valuationCapType,
      leadStatus: f.leadStatus ?? prev.leadStatus,
      committedAmount: typeof f.committedAmount === "number" ? toM(f.committedAmount) : prev.committedAmount,
      targetCloseDate: f.targetCloseDate ?? prev.targetCloseDate,
      targetRegionsCsv: Array.isArray(f.geographyTargetRegions) ? f.geographyTargetRegions.join(", ") : prev.targetRegionsCsv,
      wantedTypesCsv: Array.isArray(f.investorTypesWanted) ? f.investorTypesWanted.join(", ") : prev.wantedTypesCsv,
      businessModel: f.businessModel ?? prev.businessModel,
      customerSegment: f.customerSegment ?? prev.customerSegment,
      namedCustomersCsv: Array.isArray(f.namedCustomers) ? f.namedCustomers.join(", ") : prev.namedCustomersCsv,
      useOfFunds: f.useOfFunds ?? prev.useOfFunds,
      competitorsCsv: Array.isArray(f.competitors) ? f.competitors.join(", ") : prev.competitorsCsv,
    }))
    setExtracted(f)
    setProvenance((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(f ?? {})) if (f[key] != null && f[key] !== "" && !next[key]) next[key] = "deck"
      return next
    })
  }

  const onAnalyze = () => {
    if (!pitchDeck) {
      setAnalyzeError("Add a pitch deck PDF first.")
      return
    }
    setAnalyzeError(null)
    setDeckScores(null)
    startAnalyzing(async () => {
      try {
        const fd = new FormData()
        fd.append("pitch_deck", pitchDeck)
        const res = await fetch("/api/founder/analyze-deck", {
          method: "POST",
          body: fd,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setAnalyzeError(data.error || `Analyze failed (${res.status})`)
          return
        }
        setDeckScores(data.result)
      } catch (e: any) {
        setAnalyzeError(e?.message || "Analyze failed")
      }
    })
  }

  const onRun = () => {
    if (missing.length || extracting || matching) {
      setMatchError("Complete the required fields before matching.")
      return
    }
    setMatchError(null)
    startMatching(async () => {
      try {
        const startup = formToProfile(form, extracted)
        const res = await fetch("/api/founder/matching/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startup, minScore, enableAi, provenance }),
        })
        if (!res.ok) {
          throw new Error(await responseError(res, "Request failed"))
        }
        const data = (await res.json()) as RunResult
        setLatest(data)
        setRuns((prev) => [{ id: data.runId ?? data.sessionId, createdAt: new Date().toISOString(), groups: data.totals?.qualifiedFirms ?? 0, independents: data.totals?.qualifiedContacts ?? 0 }, ...prev].slice(0, 20))
      } catch (e: any) {
        setMatchError(e?.message ?? "Match failed")
      }
    })
  }

  // Flow completion state — drives the stepper + per-step cues.
  const hasUpload = !!pitchDeck || dataRoom.length > 0
  const hasProfile = missing.length === 0
  const hasMatch = !!latest
  const activeStep = !hasProfile ? "profile" : !hasMatch ? "match" : "done"
  // The active step's card gets an accent ring so the eye lands on the next action.
  const cardCls = (step: string) =>
    `border rounded-lg p-6 space-y-4 transition-colors ${activeStep === step ? "border-[#e5380f]/40 ring-1 ring-[#e5380f]/15" : "border-foreground/10"}`

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
          {companyDefaults && <p className="mb-4 border border-border bg-card p-4 text-sm text-muted-foreground">Company details were loaded from your active workspace. Review them and enter the round economics below; saved fundraising notes are not converted into amounts automatically.</p>}
          <PageHeader
            accent="#e5380f"
            eyebrow="Find Investors · v2"
            title="Build your investor shortlist."
            description="Upload a deck to fill empty fields, or enter your company profile manually. Review the required details, then rank relevant investors."
            actions={
              <AiStatusBadge
                title="AI extraction"
              />
            }
          />
        </div>
      </div>

      {/* Flow stepper — a spine for the upload → profile → match → pipeline flow */}
      {(() => {
        const active = !hasProfile ? 1 : !hasMatch ? 2 : 3
        const st = (i: number, done: boolean): "done" | "active" | "todo" =>
          done ? "done" : i === active ? "active" : "todo"
        return (
          <div className="border-b border-foreground/10 bg-background/60">
            <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-4">
              <FlowStepper
                steps={[
                  { label: "Upload deck (optional)", state: st(0, hasUpload) },
                  { label: "Round profile", state: st(1, hasProfile) },
                  { label: "Run match", state: st(2, hasMatch) },
                  { label: "Pipeline", state: hasMatch ? "active" : "todo" },
                ]}
              />
            </div>
          </div>
        )
      })()}

      {/* Body */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12 grid lg:grid-cols-3 gap-8">
        {/* Left: Upload + form */}
        <div className="lg:col-span-1 space-y-6">
          {/* Upload card */}
          <fieldset disabled={extracting || analyzing || matching} className={cardCls("upload")}>
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display text-xl">1. Upload</h2>
              {hasUpload && <Check className="w-4 h-4 ml-auto text-[#e5380f]" aria-label="Uploaded" />}
            </div>

            <FileDrop
              label="Pitch deck"
              accept=".pdf,.pptx,.docx"
              file={pitchDeck}
              onChange={(file) => { if (!file) return; const problem = deckUploadError([file, ...dataRoom]); if (problem) setExtractError(problem); else { setExtractError(null); setPitchDeck(file) } }}
              onClear={() => setPitchDeck(null)}
              hint="PDF, PowerPoint or Word · up to 25 MB (files over 4 MB upload straight to private storage)"
            />

            <div>
              <Label htmlFor="deck-url" className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                …or a link to the deck
              </Label>
              <Input id="deck-url" className="mt-1" placeholder="https://…/deck.pdf" value={deckUrl} onChange={(e) => setDeckUrl(e.target.value)} />
              <p className="text-[10px] font-mono text-muted-foreground mt-1">A PDF link or a public deck page. Viewers that ask for an email cannot be read — download and upload the file instead.</p>
            </div>

            <div>
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Data room (optional)
              </Label>
              <input
                ref={dataRoomInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.md,.csv,.json"
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? [])
                  const problem = deckUploadError([...(pitchDeck ? [pitchDeck] : []), ...dataRoom, ...fs])
                  if (problem) setExtractError(problem); else { setExtractError(null); setDataRoom(prev => [...prev, ...fs]) }
                  e.target.value = ""
                }}
                className="hidden"
              />
              <button
                onClick={() => dataRoomInputRef.current?.click()}
                className="w-full mt-1.5 h-10 px-3 text-sm border border-dashed border-foreground/20 rounded-md hover:border-foreground/40 transition-colors flex items-center gap-2 justify-center text-muted-foreground"
              >
                <Plus className="w-4 h-4" />
                Add files (financials, customer list, founder bios…)
              </button>
              {dataRoom.length > 0 && (
                <div className="mt-3 space-y-1">
                  {dataRoom.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-3 py-2 bg-foreground/5 rounded-md text-xs"
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span className="flex-1 truncate font-mono">{f.name}</span>
                      <span className="font-mono text-muted-foreground">
                        {(f.size / 1024).toFixed(0)} KB
                      </span>
                      <button
                        onClick={() => setDataRoom((prev) => prev.filter((_, j) => j !== i))}
                        className="p-1 text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                size="lg"
                onClick={onExtract}
                disabled={extracting || (!pitchDeck && dataRoom.length === 0)}
                className="flex-1 h-12 rounded-full bg-foreground text-background hover:bg-foreground/90 group"
              >
                {extracting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Extracting…
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    AI: extract fields
                  </>
                )}
              </Button>
              <Button
                size="lg"
                onClick={onAnalyze}
                disabled={analyzing || !pitchDeck}
                variant="outline"
                className="h-12 rounded-full border-foreground/15 hover:bg-foreground/5"
                title="Score the deck across 8 investor lenses (clarity, problem, traction, etc.)"
              >
                {analyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    Critique deck
                  </>
                )}
              </Button>
            </div>
            {analyzeError && (
              <div role="alert" className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/30 text-destructive text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{analyzeError}</span>
              </div>
            )}

            {extractError && (
              <div role="alert" className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/30 text-destructive text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{extractError}</span>
              </div>
            )}

            {aiNotes && (
              <div className="text-[11px] font-mono text-muted-foreground p-3 rounded-md bg-foreground/5 border border-foreground/10">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-3 h-3" />
                  <span className="font-medium">AI notes</span>
                  {confidence != null && (
                    <span className="ml-auto">
                      confidence {(confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="leading-relaxed">{aiNotes}</div>
              </div>
            )}
          </fieldset>

          {/* Profile form */}
          <fieldset disabled={extracting || matching} className={cardCls("profile")}>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display text-xl">2. Round profile</h2>
              {hasProfile && <Check className="w-4 h-4 ml-auto text-[#e5380f]" aria-label="Ready" />}
              <button
                type="button"
                onClick={() => setThesisDialogOpen(true)}
                className={`${hasProfile ? "" : "ml-auto "}inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5`}
                title="Suggest adjacent sectors + tighten the thesis with AI"
              >
                <Sparkles className="w-3 h-3" /> Enrich thesis
              </button>
            </div>

            <FormField label="Startup name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} required />
            <FormField label="One-liner" value={form.oneLiner} onChange={(v) => setForm((p) => ({ ...p, oneLiner: v }))} />
            <FormTextarea label="Description" value={form.description} onChange={(v) => setForm((p) => ({ ...p, description: v }))} />

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Primary sector" required value={form.primarySector} onChange={(v) => setForm((p) => ({ ...p, primarySector: v }))} placeholder="ai/ml" />
              <FormSelect
                label="Stage"
                value={form.stage}
                options={[{ v: "", l: "Select funding stage" }, ...STAGE_OPTIONS].map((s) => ({ v: s.v, l: s.l }))}
                onChange={(v) => setForm((p) => ({ ...p, stage: v }))}
              />
            </div>

            <FormField
              label="All sectors (comma separated)"
              value={form.sectorsCsv}
              onChange={(v) => setForm((p) => ({ ...p, sectorsCsv: v }))}
              placeholder="ai/ml, healthcare, saas"
            />

            <FormField label="Location" required value={form.location} onChange={(v) => setForm((p) => ({ ...p, location: v }))} placeholder="San Francisco, CA" />

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Round size ($M)" required value={form.askAmount} onChange={(v) => setForm((p) => ({ ...p, askAmount: v }))} type="number" />
              <FormField label="Pre-money ($M)" value={form.preMoneyValuation} onChange={(v) => setForm((p) => ({ ...p, preMoneyValuation: v }))} type="number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Min check ($M)" value={form.checkSizeIdealMin} onChange={(v) => setForm((p) => ({ ...p, checkSizeIdealMin: v }))} type="number" />
              <FormField label="Max check ($M)" value={form.checkSizeIdealMax} onChange={(v) => setForm((p) => ({ ...p, checkSizeIdealMax: v }))} type="number" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="ARR ($K)" value={form.arr} onChange={(v) => setForm((p) => ({ ...p, arr: v }))} type="number" />
              <FormField label="MRR ($K)" value={form.mrr} onChange={(v) => setForm((p) => ({ ...p, mrr: v }))} type="number" />
              <FormField label="Growth %/mo" value={form.growthRateMom} onChange={(v) => setForm((p) => ({ ...p, growthRateMom: v }))} type="number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Team size" value={form.teamSize} onChange={(v) => setForm((p) => ({ ...p, teamSize: v }))} type="number" />
              <FormField label="Founded" value={form.foundedYear} onChange={(v) => setForm((p) => ({ ...p, foundedYear: v }))} type="number" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormSelect
                label="Instrument"
                value={form.instrument}
                onChange={(v) => setForm((p) => ({ ...p, instrument: v }))}
                options={[{ v: "", l: "—" }, { v: "safe", l: "SAFE" }, { v: "priced-equity", l: "Priced equity" }, { v: "convertible-note", l: "Convertible note" }, { v: "other", l: "Other" }]}
              />
              <FormSelect
                label="Lead"
                value={form.leadStatus}
                onChange={(v) => setForm((p) => ({ ...p, leadStatus: v }))}
                options={[{ v: "", l: "—" }, { v: "needed", l: "Looking for a lead" }, { v: "in-discussion", l: "Lead in discussion" }, { v: "secured", l: "Lead secured" }]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Valuation cap ($M)" value={form.valuationCap} onChange={(v) => setForm((p) => ({ ...p, valuationCap: v }))} type="number" />
              <FormSelect
                label="Cap type"
                value={form.valuationCapType}
                onChange={(v) => setForm((p) => ({ ...p, valuationCapType: v }))}
                options={[{ v: "post-money", l: "Post-money" }, { v: "pre-money", l: "Pre-money" }]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Committed ($M)" value={form.committedAmount} onChange={(v) => setForm((p) => ({ ...p, committedAmount: v }))} type="number" />
              <FormField label="Target close" value={form.targetCloseDate} onChange={(v) => setForm((p) => ({ ...p, targetCloseDate: v }))} placeholder="2026-12-31" />
            </div>
            <FormField
              label="Raise from (regions, comma)"
              value={form.targetRegionsCsv}
              onChange={(v) => setForm((p) => ({ ...p, targetRegionsCsv: v }))}
              placeholder="United States, Europe"
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Investor types wanted" value={form.wantedTypesCsv} onChange={(v) => setForm((p) => ({ ...p, wantedTypesCsv: v }))} placeholder="VC, angel" />
              <FormField label="Types to exclude" value={form.excludedTypesCsv} onChange={(v) => setForm((p) => ({ ...p, excludedTypesCsv: v }))} placeholder="accelerator" />
            </div>
            <FormField
              label="Never suggest (names, comma)"
              value={form.excludedInvestorsCsv}
              onChange={(v) => setForm((p) => ({ ...p, excludedInvestorsCsv: v }))}
              placeholder="A competitor's investor, a fund you passed on"
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Business model" value={form.businessModel} onChange={(v) => setForm((p) => ({ ...p, businessModel: v }))} placeholder="B2B SaaS" />
              <FormField label="Customer" value={form.customerSegment} onChange={(v) => setForm((p) => ({ ...p, customerSegment: v }))} placeholder="College athletic departments" />
            </div>
            <FormField label="Named customers (comma)" value={form.namedCustomersCsv} onChange={(v) => setForm((p) => ({ ...p, namedCustomersCsv: v }))} />
            <FormField label="Competitors (comma)" value={form.competitorsCsv} onChange={(v) => setForm((p) => ({ ...p, competitorsCsv: v }))} />
            <FormTextarea label="Use of funds" value={form.useOfFunds} onChange={(v) => setForm((p) => ({ ...p, useOfFunds: v }))} />
            <FormField
              label="Thesis keywords (comma)"
              value={form.thesisCsv}
              onChange={(v) => setForm((p) => ({ ...p, thesisCsv: v }))}
              placeholder="vertical AI, defensible moat, network effects"
            />
          </fieldset>

          <MatchingReadiness issues={missing} />
          {/* Run */}
          <div className={cardCls("match")}>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display text-xl">3. Match</h2>
              {hasMatch && <Check className="w-4 h-4 ml-auto text-[#e5380f]" aria-label="Matched" />}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Min qualification score
                </Label>
                <span className="font-mono text-xs">{minScore}</span>
              </div>
              <Slider value={[minScore]} min={20} max={80} step={5} onValueChange={(v) => setMinScore(v[0])} />
              <p className="text-[10px] font-mono text-muted-foreground mt-2">
                Scores run 0–100. 40 keeps Priority B and better; 60 keeps Priority A; 80 keeps Champions only.
              </p>
              <label className="mt-3 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={enableAi} onChange={(e) => setEnableAi(e.target.checked)} />
                Write a reason for the top matches with AI (slower)
              </label>
            </div>

            <Button
              size="lg"
              onClick={onRun}
              disabled={matching || extracting || missing.length > 0}
              className="w-full h-12 rounded-full bg-foreground text-background hover:bg-foreground/90 group"
            >
              {matching ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scoring investor records…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run matching
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>

            {matchError && (
              <div role="alert" className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/30 text-destructive text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{matchError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: results */}
        <div className="lg:col-span-2 space-y-8">
          {deckScores && <DeckScoreCard scores={deckScores} filename={pitchDeck?.name} runSummary={latest ? { totalFirms: latest.totals?.qualifiedFirms, totalContacts: latest.totals?.qualifiedContacts, withEmail: latest.totals?.contactsWithEmail, topFirms: (latest.topFirms ?? []).slice(0, 10).map((f: any) => ({ name: f.name, type: f.type ?? null, score: f.score ?? null })), thesis: form.oneLiner || undefined } : undefined} />}
          {!latest ? (
            <div className="border border-dashed border-foreground/15 rounded-lg p-16 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-foreground/5 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-display text-2xl mb-2">No run yet</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Upload a deck or paste a link, review the profile, then run matching.
                Every firm and investor appears here — with the reason for each score,
                a 6-sheet workbook, lists of 200, CSVs and a 4-week outreach plan.
              </p>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground/10 rounded-lg overflow-hidden border border-foreground/10">
                <KPI icon={<Layers className="w-4 h-4" />} label="Firms" value={latest.totals.qualifiedFirms.toLocaleString()} sub={latest.qualifiedBeforeCap && latest.qualifiedBeforeCap.groups > latest.totals.qualifiedFirms ? `${latest.qualifiedBeforeCap.groups.toLocaleString()} qualified, capped` : `${latest.totals.rawFirms.toLocaleString()} scored`} />
                <KPI icon={<Trophy className="w-4 h-4" />} label="Lead candidates" value={latest.totals.leadCandidates.toLocaleString()} sub="can take a lead-sized check" tone="good" />
                <KPI icon={<Mail className="w-4 h-4" />} label="Reachable by email" value={latest.totals.contactsWithEmail.toLocaleString()} sub={latest.emailVerification?.providerConfigured ? `${latest.emailVerification.provider} verified this run` : "addresses not yet verified"} tone="good" />
                <KPI icon={<Sparkles className="w-4 h-4" />} label="Run time" value={`${(latest.durationMs / 1000).toFixed(1)}s`} sub={`${latest.totals.duplicatesMerged} duplicates merged`} />
              </div>

              <div className="rounded-lg border border-foreground/10 p-4 text-xs text-muted-foreground space-y-1">
                <p>
                  {latest.semantic?.status === "ok"
                    ? "Thesis matching used sector tags and how closely each investor's thesis text reads like your deck."
                    : `Thesis matching used sector tags only — ${latest.semantic?.reason ?? "the semantic layer was unavailable"}.`}
                </p>
                {latest.exclusions && (latest.exclusions.inCrm + latest.exclusions.declined + latest.exclusions.excludedByFounder + latest.exclusions.suppressed + latest.exclusions.excludedTypes) > 0 && (
                  <p>
                    Left out: {latest.exclusions.inCrm} already in your CRM · {latest.exclusions.declined} you passed on · {latest.exclusions.excludedByFounder} you excluded · {latest.exclusions.suppressed} suppressed addresses · {latest.exclusions.excludedTypes} excluded types.
                  </p>
                )}
                {runs.length > 1 && (
                  <p>
                    Earlier runs:{" "}
                    {runs.slice(1, 6).map((r) => (
                      <button key={r.id} className="underline hover:text-foreground mr-2" onClick={() => setLatest((prev) => prev && { ...prev, sessionId: r.id, runId: r.id })}>
                        {new Date(r.createdAt).toLocaleDateString()} ({r.groups.toLocaleString()} firms)
                      </button>
                    ))}
                  </p>
                )}
              </div>

              {/* Tier chart */}
              <div className="border border-foreground/10 rounded-lg p-6">
                <h2 className="font-display text-xl mb-4">Tier distribution</h2>
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={TIERS.map((t) => ({
                      name: t.label,
                      firms: latest.tierCounts.firms[t.id] ?? 0,
                      contacts: latest.tierCounts.contacts[t.id] ?? 0,
                      color: t.color,
                    }))}>
                      <CartesianGrid strokeDasharray="2 2" stroke="oklch(0.90 0 0)" vertical={false} />
                      <XAxis dataKey="name" stroke="oklch(0.45 0.01 270)" fontSize={10} />
                      <YAxis stroke="oklch(0.45 0.01 270)" fontSize={11} />
                      <Tooltip contentStyle={{ background: "oklch(0.99 0 0)", border: "1px solid oklch(0.90 0 0)", borderRadius: 8, fontFamily: "var(--font-mono)", fontSize: 12 }} />
                      <Bar dataKey="firms" name="Firms">
                        {TIERS.map((t, i) => (<Cell key={i} fill={t.color} />))}
                      </Bar>
                      <Bar dataKey="contacts" name="Contacts" opacity={0.5}>
                        {TIERS.map((t, i) => (<Cell key={i} fill={t.color} />))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Segments */}
              <div className="border border-foreground/10 rounded-lg p-6">
                <h2 className="font-display text-xl mb-4">Outreach segments</h2>
                <div className="overflow-hidden rounded-lg border border-foreground/10">
                  <table className="w-full text-sm">
                    <thead className="bg-foreground/5">
                      <tr>
                        <th className="text-left p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Segment</th>
                        <th className="text-right p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Firms</th>
                        <th className="text-right p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Contacts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SEGMENTS.map((s) => (
                        <tr key={s.v} className="border-t border-foreground/5">
                          <td className="p-3">{s.l}</td>
                          <td className="p-3 text-right font-mono">{latest.segmentCounts.firms[s.v] ?? 0}</td>
                          <td className="p-3 text-right font-mono">{latest.segmentCounts.contacts[s.v] ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Every match, paged from the run — not a top-10 teaser */}
              <MatchResults runId={latest.runId ?? latest.sessionId} canWrite={true} />

              <Deliverables runId={latest.runId ?? latest.sessionId} canWrite={true} />

              {/* Outreach handoff — promote ticked rows from edited xlsx into the CRM */}
              <ShortlistUploader source="founder_matching" sessionId={latest.sessionId} />
            </>
          )}
        </div>
      </div>
      <ThesisEnrichDialog
        open={thesisDialogOpen}
        onClose={() => setThesisDialogOpen(false)}
        kind="deck"
        thesis={form.oneLiner}
        sectors={csv(form.sectorsCsv)}
        stage={form.stage}
        hq={form.location}
        providerOverride={aiOverride}
        onApply={(patch) => {
          setForm((p) => {
            const next = { ...p }
            if (patch.thesis) next.oneLiner = patch.thesis
            if (patch.sectors && patch.sectors.length) {
              const cur = csv(next.sectorsCsv)
              const merged = Array.from(new Set([...cur, ...patch.sectors]))
              next.sectorsCsv = merged.join(", ")
            }
            return next
          })
        }}
      />
    </div>
  )
}

// ─── Flow stepper ───────────────────────────────────────────────────────────

function FlowStepper({ steps }: { steps: { label: string; state: "done" | "active" | "todo" }[] }) {
  return (
    <div className="flex items-center">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center flex-1 last:flex-none min-w-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <div
              className={`grid place-items-center w-7 h-7 rounded-full text-[13px] font-medium shrink-0 transition-colors ${
                s.state === "done"
                  ? "bg-[#e5380f] text-white"
                  : s.state === "active"
                  ? "border-2 border-[#e5380f] text-[#e5380f]"
                  : "border border-foreground/20 text-muted-foreground"
              }`}
            >
              {s.state === "done" ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-sm whitespace-nowrap ${s.state === "todo" ? "text-muted-foreground" : "font-medium"}`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-px mx-3 lg:mx-5 ${s.state === "done" ? "bg-[#e5380f]/40" : "bg-foreground/15"}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function toM(usd: number): string {
  return String(usd / 1_000_000)
}
function toK(usd: number): string {
  return String(usd / 1_000)
}
function fromM(s: string): number | null {
  if (!s.trim()) return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 1_000_000) : null
}
function fromK(s: string): number | null {
  if (!s.trim()) return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 1_000) : null
}
function csv(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean)
}

/** Saved profile (engine units) → form fields (millions / thousands). */
function profileToForm(p: Record<string, any>): Partial<StartupForm> {
  const list = (v: unknown) => (Array.isArray(v) ? v.join(", ") : "")
  return {
    name: p.name ?? "", oneLiner: p.oneLiner ?? "", description: p.description ?? "", primarySector: p.primarySector ?? "",
    sectorsCsv: list(p.sectors), stage: p.stage ?? "", location: p.location ?? "",
    askAmount: p.askAmount ? toM(p.askAmount) : "", preMoneyValuation: p.preMoneyValuation ? toM(p.preMoneyValuation) : "",
    checkSizeIdealMin: p.checkSizeIdealMin ? toM(p.checkSizeIdealMin) : "", checkSizeIdealMax: p.checkSizeIdealMax ? toM(p.checkSizeIdealMax) : "",
    arr: p.arr ? toK(p.arr) : "", mrr: p.mrr ? toK(p.mrr) : "", growthRateMom: p.growthRateMom != null ? String(p.growthRateMom) : "",
    teamSize: p.teamSize != null ? String(p.teamSize) : "", foundedYear: p.foundedYear != null ? String(p.foundedYear) : "",
    thesisCsv: list(p.thesisKeywords), instrument: p.instrument ?? "", valuationCap: p.valuationCap ? toM(p.valuationCap) : "",
    valuationCapType: p.valuationCapType ?? "post-money", leadStatus: p.leadStatus ?? "",
    committedAmount: p.committedAmount ? toM(p.committedAmount) : "", targetCloseDate: p.targetCloseDate ?? "",
    targetRegionsCsv: list(p.geographyTargetRegions), wantedTypesCsv: list(p.investorTypesWanted),
    excludedTypesCsv: list(p.investorTypesExcluded), excludedInvestorsCsv: list(p.excludedInvestors),
    businessModel: p.businessModel ?? "", customerSegment: p.customerSegment ?? "", namedCustomersCsv: list(p.namedCustomers),
    useOfFunds: p.useOfFunds ?? "", competitorsCsv: list(p.competitors),
  }
}

function formToProfile(f: StartupForm, extracted?: Record<string, any> | null) {
  return {
    id: `sp_${Date.now().toString(36)}`,
    name: f.name.trim(),
    oneLiner: f.oneLiner.trim() || undefined,
    description: f.description.trim() || undefined,
    primarySector: f.primarySector.trim() || undefined,
    sectors: csv(f.sectorsCsv).length ? csv(f.sectorsCsv) : (f.primarySector ? [f.primarySector] : []),
    stage: f.stage,
    location: f.location.trim() || null,
    askAmount: fromM(f.askAmount),
    preMoneyValuation: fromM(f.preMoneyValuation),
    checkSizeIdealMin: fromM(f.checkSizeIdealMin),
    checkSizeIdealMax: fromM(f.checkSizeIdealMax),
    arr: fromK(f.arr),
    mrr: fromK(f.mrr),
    growthRateMom: f.growthRateMom.trim() ? Number(f.growthRateMom) : null,
    teamSize: f.teamSize.trim() ? Number(f.teamSize) : null,
    foundedYear: f.foundedYear.trim() ? Number(f.foundedYear) : null,
    thesisKeywords: csv(f.thesisCsv),
    instrument: f.instrument || null,
    valuationCap: fromM(f.valuationCap),
    valuationCapType: f.valuationCap ? (f.valuationCapType || "post-money") : null,
    leadStatus: f.leadStatus || null,
    committedAmount: fromM(f.committedAmount),
    targetCloseDate: f.targetCloseDate || null,
    geographyTargetRegions: csv(f.targetRegionsCsv),
    investorTypesWanted: csv(f.wantedTypesCsv),
    investorTypesExcluded: csv(f.excludedTypesCsv),
    excludedInvestors: csv(f.excludedInvestorsCsv),
    businessModel: f.businessModel.trim() || null,
    customerSegment: f.customerSegment.trim() || null,
    namedCustomers: csv(f.namedCustomersCsv),
    useOfFunds: f.useOfFunds.trim() || null,
    competitors: csv(f.competitorsCsv),
    pitchDeckSummary: extracted?.pitchDeckSummary ?? null,
    dataRoomSummary: extracted?.dataRoomSummary ?? null,
    founderBios: extracted?.founderBios ?? [],
  }
}

// ─── Reusable form components ───────────────────────────────────────────────
function FormField({
  label, value, onChange, placeholder, required, type = "text",
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  type?: string
}) {
  const fieldId = useId()
  return (
    <div>
      <Label htmlFor={fieldId} className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        required={required}
        aria-invalid={required && !value.trim() ? true : undefined}
        className="h-9 mt-1.5 text-sm"
      />
    </div>
  )
}

function FormTextarea({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  const fieldId = useId()
  return (
    <div>
      <Label htmlFor={fieldId} className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Textarea
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 text-sm min-h-[80px]"
      />
    </div>
  )
}

function FormSelect({
  label, value, options, onChange,
}: {
  label: string
  value: string
  options: { v: string; l: string }[]
  onChange: (v: string) => void
}) {
  const fieldId = useId()
  return (
    <div>
      <Label htmlFor={fieldId} className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <select
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 mt-1.5 px-3 text-sm border border-foreground/10 rounded-md bg-background"
      >
        {options.map((o) => (<option key={o.v} value={o.v}>{o.l}</option>))}
      </select>
    </div>
  )
}

const FileDrop = (() => {
  // forwardRef pattern via inline component
  const Cmp = ({
    label, accept, file, onChange, onClear, hint,
  }: {
    label: string
    accept: string
    file: File | null
    onChange: (f: File | null) => void
    onClear: () => void
    hint?: string
  }) => {
    const ref = useRef<HTMLInputElement>(null)
    return (
      <div>
        <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
        <input
          ref={ref}
          type="file"
          accept={accept}
          onChange={(e) => { onChange(e.target.files?.[0] ?? null); e.target.value = "" }}
          className="hidden"
        />
        {!file ? (
          <button
            onClick={() => ref.current?.click()}
            className="w-full mt-1.5 h-20 px-4 border-2 border-dashed border-foreground/20 rounded-md hover:border-foreground/40 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground"
          >
            <Upload className="w-4 h-4" />
            <span className="text-xs">Click to upload</span>
            {hint && <span className="text-[10px] font-mono opacity-60">{hint}</span>}
          </button>
        ) : (
          <div className="mt-1.5 flex items-center gap-2 px-3 py-3 bg-foreground/5 rounded-md text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="flex-1 truncate">
              <div className="font-medium truncate">{file.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {(file.size / 1024).toFixed(0)} KB
              </div>
            </div>
            <button onClick={onClear} className="p-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    )
  }
  return Cmp
})()

function KPI({ icon, label, value, sub, tone = "neutral" }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tone?: "good" | "warn" | "neutral"
}) {
  return (
    <div className="bg-background p-5">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="font-mono text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn(
        "text-2xl font-display",
        tone === "good" && "text-emerald-600",
        tone === "warn" && "text-amber-600",
      )}>
        {value}
      </div>
      {sub && <div className="font-mono text-[10px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  )
}

function DeckScoreCard({ scores, filename, runSummary }: { scores: any; filename?: string; runSummary?: any }) {
  const tone = scores.overall >= 75 ? "good" : scores.overall >= 55 ? "warn" : "bad"
  const dims: { key: string; label: string }[] = [
    { key: "clarity", label: "Clarity & narrative" },
    { key: "problem", label: "Problem framing" },
    { key: "solution", label: "Solution & differentiation" },
    { key: "market", label: "Market size (TAM/SAM/SOM)" },
    { key: "traction", label: "Traction & metrics" },
    { key: "team", label: "Team & founder-market fit" },
    { key: "business_model", label: "Business model & unit economics" },
    { key: "ask", label: "Ask & use of funds" },
  ]
  const toneColor = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-destructive"

  return (
    <div className="border border-foreground/10 rounded-lg p-6">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="font-display text-xl mb-1">Pitch deck critique</h2>
          <p className="text-xs text-muted-foreground">8-dimension investor lens · scored locally</p>
        </div>
        <div className="text-right">
          <div className={cn("text-5xl font-display", toneColor)}>{scores.overall}</div>
          <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            grade {scores.grade}
          </div>
          <button
            type="button"
            onClick={async () => {
              const res = await fetch("/api/founder/critique-deck-doc", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ result: scores, filename, runSummary }),
              })
              if (!res.ok) { try { const e = await res.json(); alert(e?.error ?? "Download failed") } catch { alert("Download failed") } ; return }
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = (filename ? filename.replace(/\.[^.]+$/, "") : "pitch-deck") + "-critique.docx"
              document.body.appendChild(a); a.click(); a.remove()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            }}
            className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5"
            title="Download the critique as a Word document"
          >
            <Download className="w-3 h-3" /> Download .docx
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        {dims.map((d) => {
          const v = scores.scores?.[d.key] ?? 0
          const c = scores.comments?.[d.key] ?? ""
          const w = (v / 10) * 100
          return (
            <div key={d.key} className="p-3 border border-foreground/5 rounded-md">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium">{d.label}</span>
                <span className="font-mono text-xs">{v.toFixed(1)}/10</span>
              </div>
              <div className="h-1.5 bg-foreground/5 rounded-full overflow-hidden mb-1.5">
                <div
                  className={cn("h-full transition-all", v >= 7 ? "bg-emerald-500" : v >= 4 ? "bg-amber-500" : "bg-destructive")}
                  style={{ width: `${w}%` }}
                />
              </div>
              {c && <p className="text-[11px] text-muted-foreground leading-relaxed">{c}</p>}
            </div>
          )
        })}
      </div>

      {(scores.strengths?.length || scores.redFlags?.length || scores.missing?.length) && (
        <div className="grid md:grid-cols-3 gap-4 mb-4">
          {scores.strengths?.length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-700 mb-2">Strengths</div>
              <ul className="space-y-1">
                {scores.strengths.map((s: string, i: number) => (
                  <li key={i} className="text-xs leading-relaxed">+ {s}</li>
                ))}
              </ul>
            </div>
          )}
          {scores.redFlags?.length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-destructive mb-2">Red flags</div>
              <ul className="space-y-1">
                {scores.redFlags.map((s: string, i: number) => (
                  <li key={i} className="text-xs leading-relaxed">! {s}</li>
                ))}
              </ul>
            </div>
          )}
          {scores.missing?.length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-amber-700 mb-2">Missing</div>
              <ul className="space-y-1">
                {scores.missing.map((s: string, i: number) => (
                  <li key={i} className="text-xs leading-relaxed">– {s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {scores.suggestedNextSteps?.length > 0 && (
        <div className="p-4 rounded-md bg-foreground/5 border border-foreground/10">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Next steps</div>
          <ol className="space-y-1.5 list-decimal list-inside">
            {scores.suggestedNextSteps.map((s: string, i: number) => (
              <li key={i} className="text-xs leading-relaxed">{s}</li>
            ))}
          </ol>
        </div>
      )}

      {scores.notes && (
        <p className="text-[11px] font-mono text-muted-foreground mt-3">{scores.notes}</p>
      )}
    </div>
  )
}


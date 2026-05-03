"use client"

import { useRef, useState, useTransition } from "react"
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
  Target,
  Layers,
  Mail,
  Download,
  FileSpreadsheet,
  Trash2,
  Play,
  Trophy,
} from "lucide-react"
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
}

const EMPTY_FORM: StartupForm = {
  name: "",
  oneLiner: "",
  description: "",
  primarySector: "",
  sectorsCsv: "",
  stage: "seed",
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
}

interface RunResult {
  sessionId: string
  startupName: string
  durationMs: number
  totals: any
  tierCounts: any
  segmentCounts: any
  funnel: any
  topFirms: any[]
  topContacts: any[]
}

export function FindInvestorsContent({ aiAvailable }: { aiAvailable: boolean }) {
  const [pitchDeck, setPitchDeck] = useState<File | null>(null)
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
  const [form, setForm] = useState<StartupForm>(EMPTY_FORM)
  const [minScore, setMinScore] = useState(20)
  const [latest, setLatest] = useState<RunResult | null>(null)

  const pitchInputRef = useRef<HTMLInputElement>(null)
  const dataRoomInputRef = useRef<HTMLInputElement>(null)

  const onExtract = () => {
    if (!pitchDeck && dataRoom.length === 0) {
      setExtractError("Add a pitch deck or at least one data-room file first.")
      return
    }
    setExtractError(null)
    setAiNotes(null)
    startExtracting(async () => {
      try {
        const fd = new FormData()
        if (pitchDeck) fd.append("pitch_deck", pitchDeck)
        for (const f of dataRoom) fd.append("data_room", f)
        if (form.name) fd.append("startup_name", form.name)

        const res = await fetch("/api/founder/extract-profile", {
          method: "POST",
          body: fd,
        })
        if (!res.ok) {
          const t = await res.text()
          throw new Error(t || `Status ${res.status}`)
        }
        const { fields } = await res.json()
        applyExtractedFields(fields)
        setAiNotes(fields.notes ?? null)
        setConfidence(typeof fields.confidence === "number" ? fields.confidence : null)
      } catch (e: any) {
        setExtractError(e?.message ?? "Extraction failed")
      }
    })
  }

  const applyExtractedFields = (f: any) => {
    setForm((prev) => ({
      ...prev,
      name: f.name ?? prev.name,
      oneLiner: f.oneLiner ?? prev.oneLiner,
      description: f.description ?? prev.description,
      primarySector: f.primarySector ?? prev.primarySector,
      sectorsCsv: Array.isArray(f.sectors) ? f.sectors.join(", ") : prev.sectorsCsv,
      stage: f.stage ?? prev.stage,
      location: f.location ?? prev.location,
      askAmount: f.askAmount ? toM(f.askAmount) : prev.askAmount,
      preMoneyValuation: f.preMoneyValuation ? toM(f.preMoneyValuation) : prev.preMoneyValuation,
      checkSizeIdealMin: f.checkSizeIdealMin ? toM(f.checkSizeIdealMin) : prev.checkSizeIdealMin,
      checkSizeIdealMax: f.checkSizeIdealMax ? toM(f.checkSizeIdealMax) : prev.checkSizeIdealMax,
      arr: f.arr ? toK(f.arr) : prev.arr,
      mrr: f.mrr ? toK(f.mrr) : prev.mrr,
      growthRateMom: typeof f.growthRateMom === "number" ? String(f.growthRateMom) : prev.growthRateMom,
      teamSize: typeof f.teamSize === "number" ? String(f.teamSize) : prev.teamSize,
      foundedYear: typeof f.foundedYear === "number" ? String(f.foundedYear) : prev.foundedYear,
      thesisCsv: Array.isArray(f.thesisKeywords) ? f.thesisKeywords.join(", ") : prev.thesisCsv,
    }))
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
    if (!form.name.trim()) {
      setMatchError("Add a startup name first.")
      return
    }
    setMatchError(null)
    startMatching(async () => {
      try {
        const startup = formToProfile(form)
        const res = await fetch("/api/founder/matching/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startup, minScore }),
        })
        if (!res.ok) {
          const t = await res.text()
          throw new Error(t || `Status ${res.status}`)
        }
        const data = (await res.json()) as RunResult
        setLatest(data)
      } catch (e: any) {
        setMatchError(e?.message ?? "Match failed")
      }
    })
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
          <div className="flex items-start justify-between gap-8 flex-wrap">
            <div>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-4">
                <span className="w-8 h-px bg-foreground/30" />
                Find Investors · v2
              </span>
              <h1 className="text-5xl lg:text-6xl font-display tracking-tight leading-[0.95] mb-4">
                Upload your deck.
                <br />
                Get the pipeline.
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                AI reads your pitch deck + data room, fills your round profile, and
                ranks 20,261 firms and 46,208 partners against it. Edit anything
                before running.
              </p>
            </div>

            <div className="px-5 py-4 border border-foreground/10 rounded-lg">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                AI extraction
              </div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    aiAvailable ? "bg-emerald-500" : "bg-amber-500",
                  )}
                />
                {aiAvailable ? "Claude — ready" : "Heuristic fallback"}
              </div>
              {!aiAvailable && (
                <div className="font-mono text-[10px] text-muted-foreground mt-1">
                  Set ANTHROPIC_API_KEY to enable
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12 grid lg:grid-cols-3 gap-8">
        {/* Left: Upload + form */}
        <div className="lg:col-span-1 space-y-6">
          {/* Upload card */}
          <div className="border border-foreground/10 rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display text-xl">1. Upload</h2>
            </div>

            <FileDrop
              label="Pitch deck"
              accept=".pdf"
              file={pitchDeck}
              onChange={setPitchDeck}
              onClear={() => setPitchDeck(null)}
              ref={pitchInputRef}
              hint="PDF, max 25 MB"
            />

            <div>
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Data room (optional)
              </Label>
              <input
                ref={dataRoomInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.md,.csv"
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? [])
                  setDataRoom((prev) => [...prev, ...fs])
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
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/30 text-destructive text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{analyzeError}</span>
              </div>
            )}

            {extractError && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/30 text-destructive text-xs">
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
          </div>

          {/* Profile form */}
          <div className="border border-foreground/10 rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display text-xl">2. Round profile</h2>
            </div>

            <FormField label="Startup name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} required />
            <FormField label="One-liner" value={form.oneLiner} onChange={(v) => setForm((p) => ({ ...p, oneLiner: v }))} />
            <FormTextarea label="Description" value={form.description} onChange={(v) => setForm((p) => ({ ...p, description: v }))} />

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Primary sector" value={form.primarySector} onChange={(v) => setForm((p) => ({ ...p, primarySector: v }))} placeholder="ai/ml" />
              <FormSelect
                label="Stage"
                value={form.stage}
                options={STAGE_OPTIONS.map((s) => ({ v: s.v, l: s.l }))}
                onChange={(v) => setForm((p) => ({ ...p, stage: v }))}
              />
            </div>

            <FormField
              label="All sectors (comma separated)"
              value={form.sectorsCsv}
              onChange={(v) => setForm((p) => ({ ...p, sectorsCsv: v }))}
              placeholder="ai/ml, healthcare, saas"
            />

            <FormField label="Location" value={form.location} onChange={(v) => setForm((p) => ({ ...p, location: v }))} placeholder="San Francisco, CA" />

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Round size ($M)" value={form.askAmount} onChange={(v) => setForm((p) => ({ ...p, askAmount: v }))} type="number" />
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

            <FormField
              label="Thesis keywords (comma)"
              value={form.thesisCsv}
              onChange={(v) => setForm((p) => ({ ...p, thesisCsv: v }))}
              placeholder="vertical AI, defensible moat, network effects"
            />
          </div>

          {/* Run */}
          <div className="border border-foreground/10 rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display text-xl">3. Match</h2>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Min qualification score
                </Label>
                <span className="font-mono text-xs">{minScore}</span>
              </div>
              <Slider value={[minScore]} min={10} max={60} step={5} onValueChange={(v) => setMinScore(v[0])} />
              <p className="text-[10px] font-mono text-muted-foreground mt-2">
                Default: 20. Higher = tighter pipeline.
              </p>
            </div>

            <Button
              size="lg"
              onClick={onRun}
              disabled={matching || !form.name.trim()}
              className="w-full h-12 rounded-full bg-foreground text-background hover:bg-foreground/90 group"
            >
              {matching ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scoring 66K records…
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
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/30 text-destructive text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{matchError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: results */}
        <div className="lg:col-span-2 space-y-8">
          {deckScores && <DeckScoreCard scores={deckScores} />}
          {!latest ? (
            <div className="border border-dashed border-foreground/15 rounded-lg p-16 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-foreground/5 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-display text-2xl mb-2">No run yet</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Upload a deck and run the AI extraction. Edit fields. Run matching.
                Your investor pipeline appears here with a 5-sheet xlsx and 4-week
                outreach plan.
              </p>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground/10 rounded-lg overflow-hidden border border-foreground/10">
                <KPI icon={<Layers className="w-4 h-4" />} label="Qualified firms" value={latest.totals.qualifiedFirms.toLocaleString()} sub={`${latest.totals.rawFirms.toLocaleString()} scored`} />
                <KPI icon={<Trophy className="w-4 h-4" />} label="Lead candidates" value={latest.totals.leadCandidates.toLocaleString()} sub="stage + check fit" tone="good" />
                <KPI icon={<Mail className="w-4 h-4" />} label="Ready to email" value={latest.totals.contactsWithEmail.toLocaleString()} sub="verified email" tone="good" />
                <KPI icon={<Sparkles className="w-4 h-4" />} label="Run time" value={`${(latest.durationMs / 1000).toFixed(1)}s`} sub={`${latest.totals.duplicatesMerged} dupes merged`} />
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

              {/* Top 10 firms */}
              <div className="border border-foreground/10 rounded-lg p-6">
                <h2 className="font-display text-xl mb-4">Top 10 investor firms</h2>
                <div className="overflow-hidden rounded-lg border border-foreground/10">
                  <table className="w-full text-sm">
                    <thead className="bg-foreground/5">
                      <tr>
                        <th className="text-left p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">#</th>
                        <th className="text-left p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Score</th>
                        <th className="text-left p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Firm</th>
                        <th className="text-left p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Type</th>
                        <th className="text-left p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latest.topFirms.slice(0, 10).map((f: any, i: number) => (
                        <tr key={f.id} className="border-t border-foreground/5">
                          <td className="p-3 font-mono text-muted-foreground">{i + 1}</td>
                          <td className="p-3 font-mono font-medium">{f.score}</td>
                          <td className="p-3">
                            <div className="font-medium">{f.name}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">{f.location}</div>
                          </td>
                          <td className="p-3 font-mono text-xs">{f.type}</td>
                          <td className="p-3 text-xs text-muted-foreground max-w-[400px]">{f.whyMatch}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Deliverables */}
              <div className="border border-foreground/10 rounded-lg p-6">
                <h2 className="font-display text-xl mb-4">Download deliverables</h2>
                <div className="grid md:grid-cols-3 gap-4">
                  <DeliverableCard
                    icon={<FileSpreadsheet className="w-5 h-5" />}
                    title="Investor shortlist (xlsx)"
                    description="5 sheets: Summary, Lead Candidates, Investor Firms, Contacts, Ready to Email."
                    sessionId={latest.sessionId}
                    format="xlsx"
                  />
                  <DeliverableCard
                    icon={<FileText className="w-5 h-5" />}
                    title="Methodology"
                    description="Scoring model, conversion funnel, segment breakdown."
                    sessionId={latest.sessionId}
                    format="methodology"
                    altUrl={`/api/founder/export/${latest.sessionId}?format=methodology&doc=docx`}
                    altLabel="Word .docx"
                  />
                  <DeliverableCard
                    icon={<FileText className="w-5 h-5" />}
                    title="4-week outreach plan"
                    description="Top targets, lead candidates, locals, ready-to-email contacts, sprint plan."
                    sessionId={latest.sessionId}
                    format="outreach"
                    altUrl={`/api/founder/export/${latest.sessionId}?format=outreach&doc=docx`}
                    altLabel="Word .docx"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function toM(usd: number): string {
  return (usd / 1_000_000).toFixed(2).replace(/\.?0+$/, "")
}
function toK(usd: number): string {
  return (usd / 1_000).toFixed(0)
}
function fromM(s: string): number | null {
  const n = parseFloat(s)
  return Number.isFinite(n) ? Math.round(n * 1_000_000) : null
}
function fromK(s: string): number | null {
  const n = parseFloat(s)
  return Number.isFinite(n) ? Math.round(n * 1_000) : null
}
function csv(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean)
}

function formToProfile(f: StartupForm) {
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
    growthRateMom: parseFloat(f.growthRateMom) || null,
    teamSize: parseInt(f.teamSize, 10) || null,
    foundedYear: parseInt(f.foundedYear, 10) || null,
    thesisKeywords: csv(f.thesisCsv),
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
  return (
    <div>
      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        className="h-9 mt-1.5 text-sm"
      />
    </div>
  )
}

function FormTextarea({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Textarea
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
  return (
    <div>
      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <select
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
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
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

function DeckScoreCard({ scores }: { scores: any }) {
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

function DeliverableCard({
  icon, title, description, sessionId, format, altUrl, altLabel,
}: {
  icon: React.ReactNode
  title: string
  description: string
  sessionId: string
  format: string
  altUrl?: string
  altLabel?: string
}) {
  return (
    <div className="p-5 border border-foreground/10 rounded-lg hover:border-foreground/30 transition-colors flex flex-col">
      <div className="w-10 h-10 rounded-md bg-foreground/5 flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="font-display text-lg mb-2">{title}</h3>
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed flex-1">{description}</p>
      <div className="flex items-center gap-3 text-xs font-mono">
        <a
          href={`/api/founder/export/${sessionId}?format=${format}`}
          className="inline-flex items-center gap-1 text-foreground hover:underline"
        >
          <Download className="w-3 h-3" />
          {format === "xlsx" ? "xlsx" : "Markdown"}
        </a>
        {altUrl && (
          <a href={altUrl} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <Download className="w-3 h-3" />
            {altLabel ?? "alt"}
          </a>
        )}
      </div>
    </div>
  )
}

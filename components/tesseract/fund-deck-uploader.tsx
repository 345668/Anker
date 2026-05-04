"use client"

/**
 * FundDeckUploader — LP-side analogue of the founder pitch-deck card.
 *
 * Workflow:
 *   1. User picks a fund-deck PDF (+ optional data-room files).
 *   2. "Extract profile" calls /api/fund-deck/extract  → onExtracted(fields)
 *      which the parent can use to pre-fill / save a FundProfileV2.
 *   3. "Run LP analysis" calls /api/fund-deck/analyze   → renders 6-dim scores
 *      with claims-review table and LP objections.
 *   4. "Download .docx" downloads the report from /api/fund-deck/docx
 *      (no re-analysis — sends the in-memory result back).
 *
 * Self-contained: works on the matchmaking page, fund-profile settings,
 * or any other page that wants to bring up the LP-analyst tooling.
 */

import { useRef, useState, useTransition } from "react"
import {
  Upload,
  FileText,
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Download,
  X,
  TrendingUp,
} from "lucide-react"
import type {
  FundDeckScores,
  FundDeckDimensionKey,
} from "@/lib/ai/fund-deck-analyzer"

const DIMENSIONS: { key: FundDeckDimensionKey; label: string; short: string }[] = [
  { key: "gp_background", label: "GP background & team", short: "GP" },
  { key: "sector_focus", label: "Sector focus & edge", short: "Sector" },
  { key: "market_analysis", label: "Market analysis quality", short: "Market" },
  { key: "thesis_vs_trends", label: "Thesis vs. market trends", short: "Thesis" },
  { key: "unit_economics_check", label: "Fund / portfolio unit economics", short: "Unit Econ" },
  { key: "claims_verification", label: "Claims & track-record verifiability", short: "Claims" },
]

interface ExtractedFundFields {
  name?: string
  vehicle?: string
  fundNumber?: number
  oneLiner?: string
  description?: string
  targetRaise?: number
  averageTicket?: number
  headquartersLocation?: string
  geographicFocus?: string[]
  sectors?: string[]
  primarySector?: string
  stages?: string[]
  thesisStatement?: string
  thesisKeywords?: string[]
  gpNames?: string[]
  gpBios?: string[]
  trackRecordSummary?: string
  topPortfolioCompanies?: string[]
  notableExits?: string[]
  managementFeePct?: number
  carryPct?: number
  hurdlePct?: number
  pitchDeckSummary?: string
  dataRoomSummary?: string
  confidence?: number
  notes?: string
  extractedFrom?: string[]
  [k: string]: any
}

interface Props {
  /** Optional callback so a parent page can use the extracted fields to
   *  create / update a FundProfileV2 row without an extra round trip.  */
  onExtracted?: (fields: ExtractedFundFields) => void
  /** Pre-fill the fund-name hint to bias extraction. */
  defaultFundName?: string
  className?: string
}

export function FundDeckUploader({ onExtracted, defaultFundName, className = "" }: Props) {
  const pitchInputRef = useRef<HTMLInputElement>(null)
  const dataRoomInputRef = useRef<HTMLInputElement>(null)

  const [pitchDeck, setPitchDeck] = useState<File | null>(null)
  const [dataRoom, setDataRoom] = useState<File[]>([])
  const [fundName, setFundName] = useState(defaultFundName ?? "")
  const [emergingManager, setEmergingManager] = useState(true)

  const [extracting, startExtracting] = useTransition()
  const [analyzing, startAnalyzing] = useTransition()
  const [downloading, setDownloading] = useState(false)

  const [extractedFields, setExtractedFields] = useState<ExtractedFundFields | null>(null)
  const [scores, setScores] = useState<FundDeckScores | null>(null)
  const [error, setError] = useState<string | null>(null)

  function pickPitch() { pitchInputRef.current?.click() }
  function pickDataRoom() { dataRoomInputRef.current?.click() }

  function onPitchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (f) setPitchDeck(f)
  }
  function onDataRoomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fs = Array.from(e.target.files ?? [])
    if (fs.length) setDataRoom((prev) => [...prev, ...fs])
  }

  async function onExtract() {
    if (!pitchDeck && dataRoom.length === 0) {
      setError("Add a pitch deck or at least one data-room file first.")
      return
    }
    setError(null)
    startExtracting(async () => {
      try {
        const fd = new FormData()
        if (pitchDeck) fd.append("pitch_deck", pitchDeck)
        for (const f of dataRoom) fd.append("data_room", f)
        if (fundName) fd.append("fund_name", fundName)
        const res = await fetch("/api/fund-deck/extract", { method: "POST", body: fd })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? `Extract failed (${res.status})`)
        setExtractedFields(data.fields)
        if (data.fields?.name && !fundName) setFundName(data.fields.name)
        onExtracted?.(data.fields)
      } catch (e: any) {
        setError(e?.message ?? "Extract failed")
      }
    })
  }

  async function onAnalyze() {
    if (!pitchDeck) {
      setError("Add a pitch deck PDF first.")
      return
    }
    setError(null)
    setScores(null)
    startAnalyzing(async () => {
      try {
        const fd = new FormData()
        fd.append("pitch_deck", pitchDeck)
        fd.append("emerging_manager", String(emergingManager))
        if (fundName) fd.append("fund_name", fundName)
        if (extractedFields?.vehicle) fd.append("vehicle", extractedFields.vehicle)
        if (extractedFields?.fundNumber) fd.append("fund_number", String(extractedFields.fundNumber))
        if (extractedFields?.targetRaise) fd.append("target_raise", String(extractedFields.targetRaise))
        if (extractedFields?.sectors?.length) fd.append("sectors", extractedFields.sectors.join(","))
        const res = await fetch("/api/fund-deck/analyze", { method: "POST", body: fd })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? `Analyze failed (${res.status})`)
        setScores(data.result)
      } catch (e: any) {
        setError(e?.message ?? "Analyze failed")
      }
    })
  }

  async function onDownloadDocx() {
    if (!scores) return
    setDownloading(true)
    try {
      const res = await fetch("/api/fund-deck/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result: scores,
          fundName: fundName || extractedFields?.name,
          vehicle: extractedFields?.vehicle,
          filename: pitchDeck?.name,
        }),
      })
      if (!res.ok) throw new Error(`Download failed (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const safe = (fundName || extractedFields?.name || "fund-deck-review")
        .replace(/[^a-z0-9-_]+/gi, "-")
        .toLowerCase()
        .slice(0, 80)
      a.href = url
      a.download = `${safe}-lp-review.docx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e?.message ?? "Download failed")
    } finally {
      setDownloading(false)
    }
  }

  const removeDataRoomFile = (i: number) =>
    setDataRoom((prev) => prev.filter((_, idx) => idx !== i))

  return (
    <div className={`border border-foreground/10 rounded-lg p-6 ${className}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="font-display text-lg mb-1 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Fund deck — LP analyst review
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Upload your fund pitch deck. AI extracts the fund profile (auto-fills
            matchmaking inputs) and scores the deck across six LP lenses with
            claims-verification and likely first-call objections.
          </p>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={pitchInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={onPitchChange}
      />
      <input
        ref={dataRoomInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onDataRoomChange}
      />

      <div className="grid md:grid-cols-2 gap-3 mb-3">
        <button
          type="button"
          onClick={pickPitch}
          className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-foreground/20 rounded-md hover:border-foreground/40 hover:bg-foreground/[0.02] transition-colors text-sm"
        >
          <Upload className="w-4 h-4" />
          {pitchDeck ? `Pitch deck: ${truncate(pitchDeck.name, 28)}` : "Choose fund-deck PDF"}
        </button>
        <button
          type="button"
          onClick={pickDataRoom}
          className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-foreground/20 rounded-md hover:border-foreground/40 hover:bg-foreground/[0.02] transition-colors text-sm"
        >
          <FileText className="w-4 h-4" />
          {dataRoom.length ? `Data room: ${dataRoom.length} file${dataRoom.length === 1 ? "" : "s"}` : "Add data-room files"}
        </button>
      </div>

      {dataRoom.length > 0 && (
        <ul className="text-[11px] text-muted-foreground mb-3 space-y-0.5">
          {dataRoom.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-2 font-mono">
              <span className="truncate">{f.name}</span>
              <button onClick={() => removeDataRoomFile(i)} className="hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid md:grid-cols-2 gap-3 mb-3">
        <input
          type="text"
          value={fundName}
          onChange={(e) => setFundName(e.target.value)}
          placeholder="Fund name (hint, optional)"
          className="px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background focus:outline-none focus:border-foreground/40"
        />
        <button
          type="button"
          onClick={() => setEmergingManager(!emergingManager)}
          className="flex items-center justify-between gap-2 px-3 py-2 text-sm border border-foreground/15 rounded-md hover:bg-foreground/5"
        >
          <span className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            Emerging-manager lens (Fund I-IV)
          </span>
          <span
            className={`relative w-9 h-5 rounded-full transition-colors ${
              emergingManager ? "bg-foreground" : "bg-foreground/20"
            }`}
          >
            <span
              className="absolute top-0.5 w-4 h-4 rounded-full bg-background transition-transform"
              style={{ transform: emergingManager ? "translateX(18px)" : "translateX(2px)" }}
            />
          </span>
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onExtract}
          disabled={extracting || (!pitchDeck && dataRoom.length === 0)}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-md border border-foreground/15 text-sm hover:bg-foreground/5 disabled:opacity-50"
        >
          {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Extract fund profile
        </button>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing || !pitchDeck}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-md bg-foreground text-background text-sm hover:bg-foreground/90 disabled:opacity-50"
        >
          {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Run LP analysis
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-md text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="text-rose-700 dark:text-rose-400">{error}</span>
        </div>
      )}

      {/* Extracted fields summary */}
      {extractedFields && (
        <div className="mt-5 border border-foreground/10 rounded-md p-4 bg-foreground/[0.015]">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-display text-sm">Extracted fund profile</h4>
            {typeof extractedFields.confidence === "number" && (
              <span className="text-[10px] font-mono text-muted-foreground">
                confidence {(extractedFields.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            <DK k="Name" v={extractedFields.name} />
            <DK k="Vehicle" v={extractedFields.vehicle?.replace("_", " ").toUpperCase()} />
            <DK k="Target raise" v={extractedFields.targetRaise ? `$${(extractedFields.targetRaise / 1e6).toFixed(0)}M` : null} />
            <DK k="Avg ticket" v={extractedFields.averageTicket ? `$${(extractedFields.averageTicket / 1e6).toFixed(1)}M` : null} />
            <DK k="HQ" v={extractedFields.headquartersLocation} />
            <DK k="Stages" v={extractedFields.stages?.join(", ")} />
            <DK k="Sectors" v={extractedFields.sectors?.slice(0, 4).join(", ")} />
            <DK k="Geo focus" v={extractedFields.geographicFocus?.join(", ")} />
            <DK k="GP team" v={extractedFields.gpNames?.slice(0, 4).join(", ")} />
            <DK k="Mgmt fee / carry" v={[
              extractedFields.managementFeePct ? `${extractedFields.managementFeePct}%` : null,
              extractedFields.carryPct ? `${extractedFields.carryPct}%` : null,
            ].filter(Boolean).join(" / ") || null} />
          </dl>
          {extractedFields.thesisStatement && (
            <p className="mt-3 text-[11px] leading-relaxed">
              <span className="text-muted-foreground">Thesis: </span>
              {extractedFields.thesisStatement}
            </p>
          )}
          {extractedFields.trackRecordSummary && (
            <p className="mt-2 text-[11px] leading-relaxed">
              <span className="text-muted-foreground">Track record: </span>
              {extractedFields.trackRecordSummary}
            </p>
          )}
          {extractedFields.notes && (
            <p className="mt-2 text-[10px] font-mono text-muted-foreground italic">{extractedFields.notes}</p>
          )}
        </div>
      )}

      {/* Scores display */}
      {scores && (
        <div className="mt-5 space-y-4">
          <div className="border border-foreground/10 rounded-md p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Overall LP score
                </div>
                <div className="text-3xl font-display flex items-baseline gap-2">
                  {scores.overall}
                  <span className="text-base text-muted-foreground">/100</span>
                  <span className={`text-base font-mono px-2 rounded ${gradeColor(scores.grade)}`}>
                    {scores.grade}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground mt-1">
                  {scores.emergingManagerLens ? "emerging-manager lens" : "established-manager lens"}
                </div>
              </div>
              <button
                type="button"
                onClick={onDownloadDocx}
                disabled={downloading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-foreground/15 text-xs hover:bg-foreground/5 disabled:opacity-50"
              >
                {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Word .docx
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
              {DIMENSIONS.map((d) => (
                <div key={d.key} className="border border-foreground/10 rounded p-2">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                    {d.short}
                  </div>
                  <div className="font-display text-lg">{scores.scores[d.key]}<span className="text-xs text-muted-foreground">/10</span></div>
                  {scores.comments[d.key] && (
                    <div className="text-[10px] text-muted-foreground leading-tight mt-1 line-clamp-3">
                      {scores.comments[d.key]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {scores.thesisAlignment && (
            <Section title="Thesis vs. market trends">{scores.thesisAlignment}</Section>
          )}

          {scores.strengths.length > 0 && <BulletSection title="Strengths" items={scores.strengths} tone="good" />}
          {scores.redFlags.length > 0 && <BulletSection title="Red flags" items={scores.redFlags} tone="bad" />}
          {scores.missing.length > 0 && <BulletSection title="What's missing — LPs will ask" items={scores.missing} />}
          {scores.lpObjections.length > 0 && (
            <BulletSection title="Likely first-call LP objections" items={scores.lpObjections} tone="warn" />
          )}

          {scores.claimsReviewed.length > 0 && (
            <div className="border border-foreground/10 rounded-md p-4">
              <h4 className="font-display text-sm mb-3">Claims review ({scores.claimsReviewed.length})</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-muted-foreground border-b border-foreground/10">
                      <th className="text-left font-mono font-normal py-1.5">Claim</th>
                      <th className="text-left font-mono font-normal">Cat</th>
                      <th className="text-left font-mono font-normal">Verifiable</th>
                      <th className="text-left font-mono font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.claimsReviewed.map((c, i) => (
                      <tr key={i} className="border-b border-foreground/5 align-top">
                        <td className="py-1.5 pr-2">
                          <div className="leading-tight">{c.claim}</div>
                          {c.comment && <div className="text-muted-foreground text-[10px] mt-0.5">{c.comment}</div>}
                        </td>
                        <td className="font-mono text-muted-foreground whitespace-nowrap pr-2">{c.category.replace("_", " ")}</td>
                        <td className="font-mono text-muted-foreground whitespace-nowrap pr-2">{c.verifiable.replace("_", " ")}</td>
                        <td className="whitespace-nowrap">
                          <span className={`font-mono text-[10px] uppercase px-1.5 py-0.5 rounded ${statusColor(c.status)}`}>
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {scores.notes && (
            <div className="text-[11px] font-mono text-muted-foreground italic">{scores.notes}</div>
          )}
        </div>
      )}
    </div>
  )
}

function DK({ k, v }: { k: string; v: any }) {
  if (v == null || v === "") return null
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{String(v)}</dd>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-foreground/10 rounded-md p-4">
      <h4 className="font-display text-sm mb-2">{title}</h4>
      <p className="text-xs leading-relaxed">{children}</p>
    </div>
  )
}

function BulletSection({
  title,
  items,
  tone = "neutral",
}: {
  title: string
  items: string[]
  tone?: "good" | "bad" | "warn" | "neutral"
}) {
  const dotColor =
    tone === "good" ? "bg-emerald-500" :
    tone === "bad"  ? "bg-rose-500" :
    tone === "warn" ? "bg-amber-500" :
                      "bg-foreground/40"
  return (
    <div className="border border-foreground/10 rounded-md p-4">
      <h4 className="font-display text-sm mb-2">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor} mt-1.5 shrink-0`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function gradeColor(g: string): string {
  if (g === "A") return "bg-emerald-100 text-emerald-700"
  if (g === "B") return "bg-blue-100 text-blue-700"
  if (g === "C") return "bg-amber-100 text-amber-700"
  if (g === "D") return "bg-orange-100 text-orange-700"
  return "bg-rose-100 text-rose-700"
}
function statusColor(s: string): string {
  if (s === "plausible") return "bg-emerald-100 text-emerald-700"
  if (s === "suspicious") return "bg-amber-100 text-amber-700"
  return "bg-rose-100 text-rose-700"
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

"use client"

import { useState, useTransition } from "react"
import {
  ArrowRight,
  Sparkles,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Play,
  Layers,
  Target,
  AlertTriangle,
  CheckCircle2,
  Wand2,
  TrendingUp,
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
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { ShortlistUploader } from "@/components/tesseract/shortlist-uploader"
import { FundDeckUploader } from "@/components/tesseract/fund-deck-uploader"

interface FundProfileLite {
  id: string
  name: string
  targetRaise: number | null
  headquarters: string | null
  sectors: string[]
  primarySectors: string[]
}

interface SessionLite {
  id: string
  fundProfileId: string
  fundName: string
  qualifiedFirms: number
  qualifiedContacts: number
  contactsWithEmail: number
  anchorCandidates: number
  aiEnrichmentsApplied: number
  duplicatesMerged: number
  durationMs: number
  createdAt: string
  engineVersion: string
}

interface RunSummary {
  sessionId: string
  fundName: string
  durationMs: number
  totals: {
    rawFirms: number
    rawContacts: number
    qualifiedFirms: number
    qualifiedContacts: number
    contactsWithEmail: number
    anchorCandidates: number
    duplicatesMerged: number
    aiEnrichmentsApplied: number
  }
  tierCounts: { firms: Record<string, number>; contacts: Record<string, number> }
  segmentCounts: { firms: Record<string, number>; contacts: Record<string, number> }
  funnel: { firms: any[]; contacts: any[] }
}

const TIERS = [
  { id: "champion", label: "Champion (80+)", color: "oklch(0.70 0.15 150)" },
  { id: "priority_a", label: "Priority A (60-79)", color: "oklch(0.78 0.14 75)" },
  { id: "priority_b", label: "Priority B (40-59)", color: "oklch(0.55 0.15 200)" },
  { id: "prospect_c", label: "Prospect C (20-39)", color: "oklch(0.45 0.05 270)" },
]

const SEGMENT_LABELS: Record<string, string> = {
  local: "Local LPs",
  fund_i_reup: "Fund I Re-ups",
  anchor: "Anchor Candidates",
  university: "University Endowments",
  emerging_manager: "EM Programs",
  fo_with_email: "FO (with email)",
  fund_of_funds: "Fund of Funds",
  international: "International",
}

export function MatchmakingContent({
  fundProfiles,
  recentSessions,
}: {
  fundProfiles: FundProfileLite[]
  recentSessions: SessionLite[]
}) {
  const [isPending, startTransition] = useTransition()
  const [selectedFundId, setSelectedFundId] = useState(fundProfiles[0]?.id ?? "")
  const [minScore, setMinScore] = useState(20)
  const [enableAi, setEnableAi] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [latest, setLatest] = useState<RunSummary | null>(null)

  const selectedFund = fundProfiles.find((f) => f.id === selectedFundId)

  const runMatching = () => {
    if (!selectedFundId) {
      setError("Pick a fund profile first.")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch("/api/lp/matching/run-v2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fundProfileId: selectedFundId,
            minScore,
            enableAi,
          }),
        })
        if (!res.ok) {
          const txt = await res.text()
          throw new Error(txt || `Status ${res.status}`)
        }
        const summary = (await res.json()) as RunSummary
        setLatest(summary)
      } catch (e: any) {
        setError(e?.message ?? "Run failed")
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
                LP Matchmaking · v2
              </span>
              <h1 className="text-5xl lg:text-6xl font-display tracking-tight leading-[0.95] mb-4">
                The pipeline,
                <br />
                ranked.
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Six-dimension scoring against the SVS methodology, AI-powered
                rationales, dedup, segmentation, and a 3-file deliverable bundle —
                in one run.
              </p>
            </div>

            {/* AI status pill */}
            <div className="px-5 py-4 border border-foreground/10 rounded-lg">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Engine status
              </div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                v2 · {fundProfiles.length} fund profile{fundProfiles.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12 grid lg:grid-cols-3 gap-8">
        {/* Run controls */}
        <div className="lg:col-span-1 space-y-6">
          <div className="border border-foreground/10 rounded-lg p-6 space-y-6">
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display text-xl">New run</h2>
            </div>

            {/* Fund selector */}
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Fund profile
              </Label>
              {fundProfiles.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No fund profiles yet. Create one in Settings → Fund Profiles to enable matching.
                </p>
              ) : (
                <select
                  value={selectedFundId}
                  onChange={(e) => setSelectedFundId(e.target.value)}
                  className="w-full mt-1.5 h-10 px-3 text-sm border border-foreground/10 rounded-md bg-background"
                >
                  {fundProfiles.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.targetRaise ? ` — $${(f.targetRaise / 1e6).toFixed(0)}M` : ""}
                      {f.headquarters ? ` · ${f.headquarters}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedFund && (
              <div className="text-xs space-y-1.5 font-mono text-muted-foreground">
                <div>HQ: {selectedFund.headquarters ?? "—"}</div>
                <div>
                  Primary sectors:{" "}
                  {(selectedFund.primarySectors ?? selectedFund.sectors)
                    .slice(0, 4)
                    .join(", ") || "—"}
                </div>
              </div>
            )}

            {/* Min score */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Min qualification score
                </Label>
                <span className="font-mono text-xs">{minScore}</span>
              </div>
              <Slider
                value={[minScore]}
                min={10}
                max={60}
                step={5}
                onValueChange={(v) => setMinScore(v[0])}
              />
              <p className="text-[10px] font-mono text-muted-foreground mt-2">
                SVS default: 20. Higher = tighter pipeline.
              </p>
            </div>

            {/* AI toggle */}
            <button
              onClick={() => setEnableAi(!enableAi)}
              className="w-full flex items-center justify-between p-3 rounded-md hover:bg-foreground/5 transition-colors border border-foreground/10"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-medium">AI rationales (top-200)</span>
              </div>
              <span
                className={cn(
                  "relative w-9 h-5 rounded-full transition-colors",
                  enableAi ? "bg-foreground" : "bg-foreground/20",
                )}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-background transition-transform"
                  style={{ transform: enableAi ? "translateX(18px)" : "translateX(2px)" }}
                />
              </span>
            </button>

            <Button
              size="lg"
              className="w-full h-12 rounded-full bg-foreground text-background hover:bg-foreground/90 group"
              onClick={runMatching}
              disabled={isPending || !selectedFundId}
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run matching
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/30 text-destructive text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="text-[10px] font-mono text-muted-foreground space-y-1">
              <div>· Pre-filters non-LPs in SQL (cheap)</div>
              <div>· Dedups by normalized firm name + email</div>
              <div>· Segments into 8 outreach buckets</div>
              <div>· Bulk INSERT 200 rows/round-trip</div>
            </div>
          </div>

          {/* Recent sessions */}
          <div className="border border-foreground/10 rounded-lg p-6">
            <h2 className="font-display text-xl mb-4">Recent runs</h2>
            {recentSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions yet.</p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {recentSessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 border border-foreground/10 rounded-md hover:border-foreground/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate">{s.fundName}</span>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider",
                          s.engineVersion === "v2"
                            ? "bg-emerald-500/10 text-emerald-700"
                            : "bg-foreground/5 text-muted-foreground",
                        )}
                      >
                        {s.engineVersion}
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground mb-2">
                      {new Date(s.createdAt).toLocaleString()}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                      <KvSmall k="firms" v={s.qualifiedFirms} />
                      <KvSmall k="contacts" v={s.qualifiedContacts} />
                      <KvSmall k="anchors" v={s.anchorCandidates} />
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <ExportLink sessionId={s.id} format="xlsx" label="xlsx" />
                      <ExportLink sessionId={s.id} format="methodology" label="methodology" />
                      <ExportLink sessionId={s.id} format="agenda" label="agenda" />
                      <ShortlistUploader source="lp_matching" sessionId={s.id} compact />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: results */}
        <div className="lg:col-span-2 space-y-8">
          {/* Fund-deck analyst tooling — visible whether or not a run has happened.
              Lets the GP upload their deck, get the profile auto-extracted, and
              run a 6-dimension LP analyst review with claims-verification. */}
          <FundDeckUploader defaultFundName={selectedFund?.name} />

          {!latest ? (
            <div className="border border-dashed border-foreground/15 rounded-lg p-16 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-foreground/5 flex items-center justify-center">
                <Target className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-display text-2xl mb-2">Awaiting first run</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Pick a fund profile and run matching. You&apos;ll see the funnel,
                tier breakdown, segment counts, and a 3-file deliverable bundle here.
              </p>
            </div>
          ) : (
            <>
              {/* Top KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground/10 rounded-lg overflow-hidden border border-foreground/10">
                <KPI
                  icon={<Layers className="w-4 h-4" />}
                  label="Qualified firms"
                  value={latest.totals.qualifiedFirms.toLocaleString()}
                  sub={`${latest.totals.rawFirms.toLocaleString()} scored`}
                />
                <KPI
                  icon={<Target className="w-4 h-4" />}
                  label="Anchor candidates"
                  value={latest.totals.anchorCandidates.toLocaleString()}
                  sub="$500M+ AUM"
                  tone="good"
                />
                <KPI
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  label="Ready to contact"
                  value={latest.totals.contactsWithEmail.toLocaleString()}
                  sub="verified email"
                  tone="good"
                />
                <KPI
                  icon={<Sparkles className="w-4 h-4" />}
                  label="AI rationales"
                  value={latest.totals.aiEnrichmentsApplied.toLocaleString()}
                  sub={`${latest.totals.duplicatesMerged} dupes merged`}
                />
              </div>

              {/* Tier chart */}
              <div className="border border-foreground/10 rounded-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="font-display text-xl">Tier distribution</h2>
                    <p className="text-sm text-muted-foreground">
                      Champion → Priority A → Priority B → Prospect C
                    </p>
                  </div>
                  <TrendingUp className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart
                      data={TIERS.map((t) => ({
                        name: t.label,
                        firms: latest.tierCounts.firms[t.id] ?? 0,
                        contacts: latest.tierCounts.contacts[t.id] ?? 0,
                        color: t.color,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="2 2" stroke="oklch(0.90 0 0)" vertical={false} />
                      <XAxis dataKey="name" stroke="oklch(0.45 0.01 270)" fontSize={10} />
                      <YAxis stroke="oklch(0.45 0.01 270)" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: "oklch(0.99 0 0)",
                          border: "1px solid oklch(0.90 0 0)",
                          borderRadius: 8,
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="firms" name="Firms">
                        {TIERS.map((t, i) => (
                          <Cell key={i} fill={t.color} />
                        ))}
                      </Bar>
                      <Bar dataKey="contacts" name="Contacts" opacity={0.5}>
                        {TIERS.map((t, i) => (
                          <Cell key={i} fill={t.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Segment breakdown */}
              <div className="border border-foreground/10 rounded-lg p-6">
                <h2 className="font-display text-xl mb-4">Outreach segments</h2>
                <div className="overflow-hidden rounded-lg border border-foreground/10">
                  <table className="w-full text-sm">
                    <thead className="bg-foreground/5">
                      <tr>
                        <th className="text-left p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          Segment
                        </th>
                        <th className="text-right p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          Firms
                        </th>
                        <th className="text-right p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          Contacts
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(SEGMENT_LABELS).map((s) => (
                        <tr key={s} className="border-t border-foreground/5">
                          <td className="p-3">{SEGMENT_LABELS[s]}</td>
                          <td className="p-3 text-right font-mono">
                            {latest.segmentCounts.firms[s] ?? 0}
                          </td>
                          <td className="p-3 text-right font-mono">
                            {latest.segmentCounts.contacts[s] ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Funnel */}
              <div className="grid md:grid-cols-2 gap-6">
                <FunnelCard title="Firm funnel" stages={latest.funnel.firms} />
                <FunnelCard title="Contact funnel" stages={latest.funnel.contacts} />
              </div>

              {/* Deliverables */}
              <div className="border border-foreground/10 rounded-lg p-6">
                <h2 className="font-display text-xl mb-4">Download deliverables</h2>
                <div className="grid md:grid-cols-3 gap-4">
                  <DeliverableCard
                    icon={<FileSpreadsheet className="w-5 h-5" />}
                    title="LP Pipeline (xlsx)"
                    description="5-sheet workbook: Summary, Priority Firms, Contacts, International, Ready-to-contact."
                    sessionId={latest.sessionId}
                    format="xlsx"
                  />
                  <DeliverableCard
                    icon={<FileText className="w-5 h-5" />}
                    title="Methodology"
                    description="Scoring model, conversion funnel, segmentation. Markdown — open in any editor."
                    sessionId={latest.sessionId}
                    format="methodology"
                  />
                  <DeliverableCard
                    icon={<FileText className="w-5 h-5" />}
                    title="Meeting agenda"
                    description="9-section strategy meeting framework with sprint plan and decisions required."
                    sessionId={latest.sessionId}
                    format="agenda"
                  />
                </div>
              </div>

              {/* Outreach handoff — promote ticked rows from edited xlsx into the CRM */}
              <ShortlistUploader source="lp_matching" sessionId={latest.sessionId} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function KPI({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
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
      <div
        className={cn(
          "text-2xl font-display",
          tone === "good" && "text-emerald-600",
          tone === "warn" && "text-amber-600",
        )}
      >
        {value}
      </div>
      {sub && <div className="font-mono text-[10px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  )
}

function KvSmall({ k, v }: { k: string; v: number }) {
  return (
    <div className="text-center">
      <div className="text-muted-foreground/60 mb-0.5">{k}</div>
      <div className="font-medium text-foreground">{v.toLocaleString()}</div>
    </div>
  )
}

function FunnelCard({ title, stages }: { title: string; stages: any[] }) {
  return (
    <div className="border border-foreground/10 rounded-lg p-6">
      <h3 className="font-display text-lg mb-4">{title}</h3>
      <div className="space-y-2">
        {stages.map((s: any, i: number) => {
          const width = Math.max(2, s.pct)
          return (
            <div key={i} className="text-xs">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-mono">
                  {s.count.toLocaleString()}{" "}
                  <span className="text-muted-foreground">({s.pct}%)</span>
                </span>
              </div>
              <div className="h-1.5 bg-foreground/5 rounded overflow-hidden">
                <div
                  className="h-full bg-foreground transition-all"
                  style={{ width: `${width}%` }}
                />
              </div>
              {s.notes && (
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{s.notes}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DeliverableCard({
  icon,
  title,
  description,
  sessionId,
  format,
}: {
  icon: React.ReactNode
  title: string
  description: string
  sessionId: string
  format: string
}) {
  return (
    <a
      href={`/api/lp/export/deliverables/${sessionId}?format=${format}`}
      className="block p-5 border border-foreground/10 rounded-lg hover:border-foreground/30 transition-colors group"
    >
      <div className="w-10 h-10 rounded-md bg-foreground/5 flex items-center justify-center mb-3 group-hover:bg-foreground group-hover:text-background transition-colors">
        {icon}
      </div>
      <h3 className="font-display text-lg mb-2">{title}</h3>
      <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{description}</p>
      <span className="inline-flex items-center gap-1 text-xs font-mono text-foreground">
        <Download className="w-3 h-3" />
        Download
      </span>
    </a>
  )
}

function ExportLink({ sessionId, format, label }: { sessionId: string; format: string; label: string }) {
  return (
    <a
      href={`/api/lp/export/deliverables/${sessionId}?format=${format}`}
      className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
    >
      <Download className="w-2.5 h-2.5" />
      {label}
    </a>
  )
}

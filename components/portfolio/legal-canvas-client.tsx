"use client"

/**
 * Legal & Compliance — canvas viewer.
 *
 * Matches the reference screenshot's layout:
 *   - Top tab strip: Canvas | Fields | All Documents
 *   - Top-right toolbar: legal-credits counter, Draft status pill,
 *     Purchase-required lock, Submit-for-Legal-Review CTA
 *   - Three entity boxes in a top → bottom hierarchy (Management Company
 *     at top branching down to GP and Fund)
 *   - Each entity box holds its document cards with a per-doc progress bar
 *   - Bottom-left "To Do N" counter showing total unstarted/unapproved docs
 *
 * Phase-1 affordances only; clicking a document card is a no-op until the
 * document-review viewer lands in phase 4. The Fields tab routes to the
 * phase-2 editor. Submit-for-Legal-Review is stubbed until phase 5.
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, FileText, Lock, Send, Coins, LayoutGrid, ListChecks,
  FolderOpen, ZoomIn, ZoomOut, RotateCcw, HelpCircle,
} from "lucide-react"
import type { LegalTree, LegalEntityWithDocs } from "@/lib/portfolio/legal"
import { ENTITY_LABELS, type EntityKind } from "@/lib/portfolio/legal-catalogue"

interface Props {
  tree: LegalTree
}

export function LegalCanvasClient({ tree }: Props) {
  const { fund, entities, needsMigration, stats } = tree
  const [zoom, setZoom] = useState(1)
  const ZOOM_MIN = 0.5
  const ZOOM_MAX = 1.5
  const ZOOM_STEP = 0.1

  // To-do counter — docs not yet approved or filed. Matches the screenshot's
  // "To Do 13" badge in the bottom-left.
  const todoCount = useMemo(
    () => entities.reduce(
      (n, e) => n + e.documents.filter((d) => d.status === "draft" || d.status === "pending_review").length,
      0,
    ),
    [entities],
  )

  const completionDisplay = Math.round(stats.overallCompletionPct * 100)

  return (
    <main className="min-h-screen bg-foreground text-background">
      {/* Top bar — Canvas / Fields / All Documents tabs + chrome */}
      <header className="border-b border-background/10 bg-foreground">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-8 py-3 flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/portfolio/fund"
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-background/60 hover:text-background"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Fund
          </Link>
          <span aria-hidden className="w-1 h-1 rounded-full bg-background/30" />
          <span className="text-xs font-mono uppercase tracking-wider text-background/60">
            Legal
          </span>

          {/* View tabs */}
          <nav className="ml-4 inline-flex items-center gap-1 p-1 rounded-md border border-background/15 bg-background/5">
            <TabButton href="/dashboard/portfolio/fund/legal" active={true} icon={<LayoutGrid className="w-3.5 h-3.5" />} label="Canvas" />
            <TabButton href="/dashboard/portfolio/fund/legal/fields" active={false} icon={<ListChecks className="w-3.5 h-3.5" />} label="Fields" />
            <TabButton href="/dashboard/portfolio/fund/legal/documents" active={false} icon={<FolderOpen className="w-3.5 h-3.5" />} label="All Documents" />
          </nav>

          {/* Right cluster */}
          <div className="ml-auto inline-flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-background/15 text-background/80"
              title="Legal credits — required to submit for legal review. Phase 5 wires the purchase flow."
            >
              <Coins className="w-3.5 h-3.5" /> 0 legal credits
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Draft
            </span>
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 disabled:cursor-not-allowed"
              title="Purchase legal credits to submit. Phase 5."
            >
              <Lock className="w-3.5 h-3.5" /> Purchase required
            </button>
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-md bg-emerald-500 text-foreground font-medium hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Submit-for-legal-review workflow lands in phase 5."
            >
              <Send className="w-3.5 h-3.5" /> Submit for Legal Review
            </button>
          </div>
        </div>
      </header>

      {/* Zoom toolbar */}
      <div className="border-b border-background/10 bg-foreground/95 px-6 lg:px-8 py-2 flex items-center justify-center gap-1">
        <span className="font-mono text-[10px] text-background/60 mr-2">{stats.completedDocs}/{stats.totalDocs}</span>
        <div className="flex-1 max-w-md h-1 bg-background/10 rounded overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${completionDisplay}%` }} />
        </div>
        <span className="font-mono text-[10px] text-background/60 ml-2 mr-4">{completionDisplay}%</span>
        <button onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100))} disabled={zoom <= ZOOM_MIN} className="p-1 rounded hover:bg-background/10 disabled:opacity-30">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="font-mono text-[10px] w-9 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100))} disabled={zoom >= ZOOM_MAX} className="p-1 rounded hover:bg-background/10 disabled:opacity-30">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setZoom(1)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-background/10 text-[10px] font-mono">
          <RotateCcw className="w-3 h-3" /> Reset view
        </button>
        <button className="p-1 rounded hover:bg-background/10 ml-1" title="Keyboard shortcuts coming in phase 5">
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Canvas body */}
      <div className="relative overflow-auto" style={{ minHeight: "calc(100vh - 110px)" }}>
        {needsMigration ? (
          <MigrationBanner />
        ) : (
          <div
            className="px-6 lg:px-8 py-10 mx-auto"
            style={{ transform: `scale(${zoom})`, transformOrigin: "center top", transition: "transform 200ms ease-out", maxWidth: "1400px" }}
          >
            <EntityHierarchy entities={entities} />
          </div>
        )}

        {/* Bottom-left To Do counter — matches the screenshot */}
        {!needsMigration && (
          <div className="fixed bottom-4 left-4 inline-flex items-center gap-2 px-3 py-2 rounded-md border border-background/15 bg-foreground/95 backdrop-blur text-xs font-mono uppercase tracking-wider text-background/70 shadow-lg">
            <ListChecks className="w-3.5 h-3.5" />
            <span>To Do</span>
            <span className="px-1.5 py-0.5 rounded bg-background/10 text-background">{todoCount}</span>
          </div>
        )}
      </div>
    </main>
  )
}

// ── entity hierarchy + connectors ─────────────────────────────────────

function EntityHierarchy({ entities }: { entities: LegalEntityWithDocs[] }) {
  const mgmt = entities.find((e) => e.kind === "management_company")
  const gp = entities.find((e) => e.kind === "general_partner")
  const fund = entities.find((e) => e.kind === "fund")

  return (
    <div className="flex flex-col items-center gap-0">
      {mgmt && <EntityBox entity={mgmt} />}
      {mgmt && (gp || fund) && (
        <div className="w-px h-10 bg-background/20 mt-2" aria-hidden />
      )}
      <div className="flex flex-wrap items-start justify-center gap-12 gap-y-10 mt-2">
        {gp && <EntityBox entity={gp} />}
        {fund && <EntityBox entity={fund} />}
      </div>
    </div>
  )
}

function EntityBox({ entity }: { entity: LegalEntityWithDocs }) {
  const complete = entity.documents.filter((d) => d.status === "approved" || d.status === "filed").length
  const total = entity.documents.length
  return (
    <section className="rounded-xl border border-background/15 bg-foreground/80 backdrop-blur px-5 py-4 min-w-[300px] max-w-[640px]">
      <header className="mb-3">
        <h2 className="font-medium text-sm text-background">{entity.name}</h2>
        <div className="text-[10px] font-mono uppercase tracking-wider text-background/60 mt-0.5">
          {ENTITY_LABELS[entity.kind as EntityKind]} · {complete}/{total} complete
        </div>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {entity.documents.map((d) => (
          <DocumentCard key={d.id} doc={d} />
        ))}
      </div>
    </section>
  )
}

function DocumentCard({ doc }: { doc: LegalEntityWithDocs["documents"][number] }) {
  const pct = Math.max(0, Math.min(1, Number(doc.completion_pct ?? 0)))
  const pctBar = Math.round(pct * 100)
  const isComplete = doc.status === "approved" || doc.status === "filed"
  return (
    <div
      className="rounded-md border border-background/15 bg-background/[0.03] hover:bg-background/[0.06] transition-colors p-2.5 cursor-default"
      title={`${doc.title}\nStatus: ${doc.status}\n${pctBar}% complete`}
    >
      <div className="flex items-start gap-1.5 mb-2">
        <FileText className="w-3 h-3 mt-0.5 shrink-0 text-background/60" />
        <span className="text-[10px] leading-tight font-medium text-background line-clamp-3">
          {doc.short_title || doc.title}
        </span>
      </div>
      <div className="h-1 bg-background/10 rounded overflow-hidden">
        <div
          className={`h-full transition-all ${isComplete ? "bg-emerald-500" : pctBar > 0 ? "bg-emerald-500/60" : "bg-background/20"}`}
          style={{ width: `${pctBar}%` }}
        />
      </div>
    </div>
  )
}

// ── small components ──────────────────────────────────────────────────-

function TabButton({
  href, active, icon, label, hint,
}: {
  href: string
  active: boolean
  icon: React.ReactNode
  label: string
  hint?: string
}) {
  const cls = active
    ? "bg-background text-foreground"
    : "text-background/70 hover:bg-background/10"
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${cls}`}
      title={hint ? `${label} — ${hint}` : label}
    >
      {icon}
      {label}
    </Link>
  )
}

function MigrationBanner() {
  return (
    <div className="max-w-2xl mx-auto px-6 lg:px-8 py-16 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-mono uppercase tracking-wider mb-4">
        Migration pending
      </div>
      <h2 className="text-xl font-medium mb-2">Legal tables haven't been created yet.</h2>
      <p className="text-sm text-background/70 mb-6">
        Run the migration from your Mac to enable the canvas. Once it's done, the 3
        entities + 13 documents will auto-seed on the next page load.
      </p>
      <pre className="text-left text-xs font-mono bg-background/5 border border-background/15 rounded p-4 overflow-x-auto">
{`cd ~/anker
NEON_DATABASE_URL='…' \\
  node scripts/oneshot/run-legal-entities-tables.mjs`}
      </pre>
    </div>
  )
}

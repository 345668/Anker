"use client"

/**
 * LP portal landing page.
 *
 * Layout
 * ──────
 *   - Per-fund summary card(s) at top: name + vintage + commitment /
 *     called / distributed / uncalled
 *   - Documents section filtered by category, with a per-fund chip in
 *     the row when the LP is on multiple funds
 *   - Each doc links straight to the file URL (Vercel Blob is the
 *     storage backend, public-with-random-suffix for now)
 *
 * Read-only.  No write affordances — the GP is the only one who can
 * upload, and the LP just consumes.
 */

import { useMemo, useState } from "react"
import {
  FileText, ExternalLink, Search, Wallet, ArrowUpRight,
  Calendar, User,
} from "lucide-react"
import type { LpMembership, DataRoomDocumentWithScope, DocumentCategory } from "@/lib/portfolio/data-room"

interface Props {
  memberships: LpMembership[]
  initialDocuments: DataRoomDocumentWithScope[]
}

const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  subscription: "Subscription", quarterly_letter: "Quarterly letter",
  capital_call: "Capital call", distribution: "Distribution",
  k1: "K-1 / tax", financials: "Financials",
  policy: "Policy / LPA", other: "Other",
}

export function LpDashboardClient({ memberships, initialDocuments }: Props) {
  const [docs] = useState(initialDocuments)
  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "all">("all")
  const [fundFilter, setFundFilter] = useState<string>("all")

  const byCategory = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const d of docs) counts[d.category] = (counts[d.category] ?? 0) + 1
    return counts
  }, [docs])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return docs.filter((d) => {
      if (categoryFilter !== "all" && d.category !== categoryFilter) return false
      if (fundFilter !== "all" && d.fund_id !== fundFilter) return false
      if (q) {
        const blob = `${d.title} ${d.description ?? ""} ${d.file_name ?? ""}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [docs, query, categoryFilter, fundFilter])

  const fundById = useMemo(() => {
    const m = new Map<string, LpMembership>()
    memberships.forEach((mm) => m.set(mm.fund_id, mm))
    return m
  }, [memberships])

  return (
    <main className="max-w-6xl mx-auto px-6 lg:px-10 py-8 space-y-10">
      {/* Per-fund summary cards */}
      <section className="space-y-4">
        <h2 className="font-display text-xl tracking-tight">Your funds</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {memberships.map((m) => (
            <FundCard key={m.fund_lp_id} membership={m} />
          ))}
        </div>
      </section>

      {/* Documents */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-2 flex-wrap">
          <h2 className="font-display text-xl tracking-tight">Documents</h2>
          <span className="text-xs text-muted-foreground font-mono">
            {filtered.length}/{docs.length}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, description, filename…"
              className="w-full h-9 pl-8 pr-3 text-sm border border-foreground/15 rounded-md bg-background" />
          </div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as any)}
            className="h-9 px-2.5 text-sm border border-foreground/15 rounded-md bg-background">
            <option value="all">All categories</option>
            {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}{byCategory[v] ? ` (${byCategory[v]})` : ""}</option>
            ))}
          </select>
          {memberships.length > 1 && (
            <select value={fundFilter} onChange={(e) => setFundFilter(e.target.value)}
              className="h-9 px-2.5 text-sm border border-foreground/15 rounded-md bg-background">
              <option value="all">All funds</option>
              {memberships.map((m) => <option key={m.fund_id} value={m.fund_id}>{m.fund_name}</option>)}
            </select>
          )}
        </div>

        <div className="border border-foreground/10 rounded-md divide-y divide-foreground/10 bg-background">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <FileText className="w-6 h-6 mx-auto mb-2 opacity-40" />
              No documents match. {docs.length === 0 ? "The GP hasn't shared any yet." : "Try clearing filters."}
            </div>
          ) : filtered.map((d) => (
            <DocRow
              key={d.id}
              doc={d}
              fundName={fundById.get(d.fund_id)?.fund_name ?? "—"}
              multipleFunds={memberships.length > 1}
            />
          ))}
        </div>
      </section>
    </main>
  )
}

function FundCard({ membership }: { membership: LpMembership }) {
  const m = membership
  const ratio = m.called_amount > 0
    ? Math.round((m.distributed_amount / m.called_amount) * 100) / 100
    : null
  const uncalled = m.commitment_amount != null
    ? Math.max(0, m.commitment_amount - m.called_amount)
    : null

  return (
    <div className="border border-foreground/10 rounded-md p-5 bg-background">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
        <Wallet className="w-3 h-3" />
        <span>{m.fund_slug}</span>
      </div>
      <h3 className="font-display text-lg tracking-tight">{m.fund_name}</h3>
      <div className="text-xs text-muted-foreground mt-1">As {m.lp_name}</div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Cell label="Commitment" value={fmt(m.commitment_amount)} />
        <Cell label="Called" value={fmt(m.called_amount)} />
        <Cell label="Uncalled" value={fmt(uncalled)} />
        <Cell label="Distributed" value={fmt(m.distributed_amount)} tone="emerald" />
      </div>
      {ratio != null && (
        <div className="mt-3 pt-3 border-t border-foreground/10 text-xs font-mono text-muted-foreground">
          Distributions / called: <span className="text-foreground">{ratio.toFixed(2)}x</span>
        </div>
      )}
    </div>
  )
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "emerald" }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-base mt-0.5 ${tone === "emerald" ? "text-emerald-600" : ""}`}>{value}</div>
    </div>
  )
}

function DocRow({
  doc, fundName, multipleFunds,
}: {
  doc: DataRoomDocumentWithScope
  fundName: string
  multipleFunds: boolean
}) {
  return (
    <a
      href={doc.file_url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-4 px-5 py-3 hover:bg-foreground/[0.02] group"
    >
      <div className="w-9 h-9 rounded-md bg-foreground/5 border border-foreground/10 flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4 text-foreground/60" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground group-hover:translate-x-0.5 transition-transform truncate">
            {doc.title}
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border border-foreground/15 bg-background text-foreground/70">
            {CATEGORY_LABEL[doc.category]}
          </span>
          {doc.fund_lp_id && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border border-blue-500/20 bg-blue-500/10 text-blue-700">
              <User className="w-2.5 h-2.5" /> Only you
            </span>
          )}
          {multipleFunds && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">· {fundName}</span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] font-mono text-muted-foreground truncate">
          <Calendar className="w-2.5 h-2.5 inline mr-1" />
          {new Date(doc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {doc.byte_size != null && ` · ${(doc.byte_size / 1024).toFixed(0)} KB`}
          {doc.file_name && ` · ${doc.file_name}`}
        </div>
        {doc.description && (
          <div className="mt-1 text-xs text-muted-foreground line-clamp-1">{doc.description}</div>
        )}
      </div>
      <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
    </a>
  )
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—"
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

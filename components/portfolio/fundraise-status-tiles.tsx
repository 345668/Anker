"use client"

import Link from "next/link"
import type { SubscriptionFunnelStage, SubscriptionStatus } from "@/lib/portfolio/funds"

/**
 * Carta-style "Investor status overview" — the fundraise funnel as status tiles
 * (Prospective / Invited / Signed / Countersigned) plus a segmented progress
 * bar, each stage carrying committed $ + investor count + an inline next action.
 */

const BASE = "/dashboard/portfolio/fund"

const STAGE: Record<SubscriptionStatus, { label: string; tint: string; action: { label: string; href: string } }> = {
  prospective:   { label: "Prospective",   tint: "#c7d0f7", action: { label: "Invite prospects", href: `${BASE}/partners` } },
  invited:       { label: "Invited",        tint: "#8fa2ef", action: { label: "Follow up",        href: `${BASE}/partners` } },
  signed:        { label: "Signed",         tint: "#5470e6", action: { label: "Countersign",      href: `${BASE}/partners` } },
  countersigned: { label: "Countersigned",  tint: "#2f45e0", action: { label: "Call capital",     href: `${BASE}/calls/new` } },
}
const ORDER: SubscriptionStatus[] = ["prospective", "invited", "signed", "countersigned"]

function money(v: number, currency = "USD") {
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : ""
  if (v >= 1e6) return `${sym}${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `${sym}${(v / 1e3).toFixed(0)}K`
  return `${sym}${Math.round(v).toLocaleString()}`
}

export function FundraiseStatusTiles({
  funnel,
  currency = "USD",
}: {
  funnel: SubscriptionFunnelStage[]
  currency?: string
}) {
  const by = Object.fromEntries(funnel.map((s) => [s.status, s])) as Record<SubscriptionStatus, SubscriptionFunnelStage>
  const total = funnel.reduce((s, x) => s + x.committed, 0)

  return (
    <section className="space-y-5">
      {/* Progress bar */}
      <div>
        <div className="flex items-center gap-2.5 mb-2.5 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#2f45e0]" />
          Fundraising progress
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
          {ORDER.map((k) => {
            const pct = total > 0 ? (by[k].committed / total) * 100 : 0
            if (pct <= 0) return null
            return <div key={k} style={{ width: `${pct}%`, background: STAGE[k].tint }} title={`${STAGE[k].label}: ${money(by[k].committed, currency)}`} />
          })}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
          {ORDER.map((k) => (
            <div key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-sm" style={{ background: STAGE[k].tint }} />
              {STAGE[k].label}: <span className="text-foreground font-medium tabular-nums">{money(by[k].committed, currency)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Status tiles */}
      <div>
        <h2 className="font-display text-lg tracking-tight mb-3">Investor status overview</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {ORDER.map((k) => {
            const s = by[k]
            return (
              <div key={k} className="border border-foreground/10 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-sm" style={{ background: STAGE[k].tint }} />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{STAGE[k].label}</span>
                </div>
                <div className="text-2xl font-display tabular-nums">{money(s.committed, currency)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{s.count} investor{s.count === 1 ? "" : "s"}</div>
                <Link href={STAGE[k].action.href} className="mt-3 inline-block text-xs text-[#2f45e0] hover:underline underline-offset-2">
                  {STAGE[k].action.label} →
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

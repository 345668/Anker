"use client"

import { useState } from "react"
import { Eye, ChevronDown, ChevronUp } from "lucide-react"
import type { DocumentViewStat, RecentDocumentView } from "@/lib/portfolio/data-room"

const timeAgo = (s: string) => {
  const d = Date.now() - new Date(s).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/** GP-facing deck / data-room engagement: who viewed what. Collapsed by default. */
export function DocumentEngagementPanel({ stats, recent }: { stats: DocumentViewStat[]; recent: RecentDocumentView[] }) {
  const [open, setOpen] = useState(false)
  const totalViews = stats.reduce((s, d) => s + d.views, 0)
  const uniqueViewers = new Set(recent.map((r) => r.viewer_email)).size

  if (stats.length === 0) {
    return (
      <div className="px-6 lg:px-8 pt-6">
        <div className="border border-foreground/10 rounded-xl px-5 py-4 flex items-center gap-3 text-sm text-muted-foreground">
          <Eye className="w-4 h-4" /> No document views recorded yet — engagement appears here once LPs open shared documents.
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 lg:px-8 pt-6">
      <div className="border border-foreground/10 rounded-xl overflow-hidden">
        <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-foreground/[0.02]">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-8 h-8 rounded-md bg-[#2f45e0]/10 text-[#2f45e0]"><Eye className="w-4 h-4" /></span>
            <div className="text-left">
              <div className="text-sm font-medium">Document engagement</div>
              <div className="text-xs text-muted-foreground">{totalViews} views · {uniqueViewers} viewer{uniqueViewers === 1 ? "" : "s"} · {stats.length} document{stats.length === 1 ? "" : "s"} opened</div>
            </div>
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {open && (
          <div className="border-t border-foreground/10 grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-foreground/10">
            {/* Per-document */}
            <div className="p-5">
              <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">Most viewed</div>
              <table className="w-full text-sm">
                <tbody>
                  {stats.slice(0, 8).map((d) => (
                    <tr key={d.document_id} className="border-b border-foreground/[0.06] last:border-0">
                      <td className="py-2 pr-2 font-medium truncate max-w-[220px]">{d.title}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">{d.views} view{d.views === 1 ? "" : "s"}</td>
                      <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">{d.unique_viewers} viewer{d.unique_viewers === 1 ? "" : "s"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recent activity */}
            <div className="p-5">
              <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">Recent activity</div>
              <ul className="space-y-2">
                {recent.slice(0, 10).map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.is_lp ? "bg-[#127c78]" : "bg-foreground/40"}`} />
                    <span className="font-medium truncate">{r.viewer_email ?? "Unknown"}</span>
                    <span className="text-muted-foreground">opened</span>
                    <span className="text-muted-foreground truncate flex-1">{r.title}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{timeAgo(r.viewed_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

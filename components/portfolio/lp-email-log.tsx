"use client"

import { useEffect, useState } from "react"
import { Mail, Loader2 } from "lucide-react"
import { EmptyState } from "@/components/shell/empty-state"

type Notice = { partner: string; subject: string; type: string; at: string | null; status: string; amount: number }

const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v).toLocaleString()}`)
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")

// Per-LP notice statuses → a delivery-style label + tone.
const STATUS: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pending",   cls: "text-muted-foreground" },
  sent:      { label: "Sent",      cls: "text-[#2f45e0]" },
  notified:  { label: "Notified",  cls: "text-[#2f45e0]" },
  paid:      { label: "Paid",      cls: "text-emerald-600 dark:text-emerald-400" },
  waived:    { label: "Waived",    cls: "text-muted-foreground" },
  defaulted: { label: "Defaulted", cls: "text-rose-600 dark:text-rose-400" },
}

export function LpEmailLog({ fundId }: { fundId: string }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!fundId) { setLoading(false); return }
    fetch(`/api/portfolio/lp-notices?fundId=${encodeURIComponent(fundId)}`)
      .then((r) => r.json())
      .then((d) => setNotices(d.notices ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [fundId])

  if (loading) {
    return <div className="py-16 flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
  }
  if (notices.length === 0) {
    return <EmptyState icon={Mail} title="No notices sent yet" description="Capital-call and distribution notices issued to LPs will appear here." />
  }

  return (
    <div className="overflow-x-auto border border-foreground/10 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <th className="text-left px-4 py-2.5">Partner</th>
            <th className="text-left px-4 py-2.5">Subject</th>
            <th className="text-left px-4 py-2.5">Type</th>
            <th className="text-right px-4 py-2.5">Amount</th>
            <th className="text-left px-4 py-2.5">Sent</th>
            <th className="text-left px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {notices.map((n, i) => {
            const s = STATUS[n.status] ?? { label: n.status, cls: "text-muted-foreground" }
            return (
              <tr key={i} className="border-b border-foreground/[0.06] last:border-0">
                <td className="px-4 py-2.5 font-medium">{n.partner}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{n.subject}</td>
                <td className="px-4 py-2.5">{n.type}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{money(n.amount)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{fmt(n.at)}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center gap-1.5 ${s.cls}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" /> {s.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

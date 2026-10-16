"use client"

import { useEffect, useState } from "react"

interface Usage { limit: number | null; used: number; remaining: number | null; pct: number | null; areas: Array<{ area: string; usd: number; detail: string }>; resetsOn: string | null }
const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`

export function UsageCard() {
  const [u, setU] = useState<Usage | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => { fetch("/api/usage", { cache: "no-store" }).then(async (r) => r.ok ? setU(await r.json()) : setErr(true)).catch(() => setErr(true)) }, [])
  if (err) return <p role="alert" className="text-sm text-red-600">Usage could not be loaded. Try again in a moment.</p>
  if (!u) return <p className="text-sm text-muted-foreground" aria-live="polite">Loading…</p>
  const pct = u.pct === null ? null : Math.min(100, Math.round(u.pct * 100))
  return (
    <section className="rounded-xl border p-5" aria-labelledby="usage-h">
      <h2 id="usage-h" className="text-lg font-semibold">AI allowance this month</h2>
      {u.limit === null ? <p className="mt-2 text-sm">Your plan has no monthly limit on AI use. This month so far: <strong>{usd(u.used)}</strong>.</p> : (
        <div className="mt-2">
          <p className="text-sm">Used <strong>{usd(u.used)}</strong> of <strong>{usd(u.limit)}</strong>{u.resetsOn ? `. Resets on ${u.resetsOn}.` : "."}</p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Share of the monthly allowance used">
            <div className={`h-full ${pct !== null && pct >= 100 ? "bg-red-600" : pct !== null && pct >= 80 ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${pct ?? 0}%` }} />
          </div>
          {pct !== null && pct >= 100 && <p className="mt-2 text-sm text-red-700">The allowance is used up. AI answers, voice notes, document reading and generation are paused until it resets.</p>}
          {pct !== null && pct >= 80 && pct < 100 && <p className="mt-2 text-sm text-amber-700">You have used most of this month's allowance.</p>}
        </div>)}
      <h3 className="mt-5 text-sm font-medium">Where it went</h3>
      {u.areas.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Nothing used yet this month.</p> : (
        <table className="mt-2 w-full text-left text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="py-1">Area</th><th>Amount</th><th className="text-right">Cost</th></tr></thead>
          <tbody>{u.areas.map((a) => <tr key={a.area} className="border-t"><td className="py-1.5 capitalize">{a.area}</td><td className="text-muted-foreground">{a.detail}</td><td className="text-right">{usd(a.usd)}</td></tr>)}</tbody></table>)}
      <p className="mt-3 text-xs text-muted-foreground">Costs are list prices, whichever way a request was served. Some amounts are estimates (marked as such in the underlying records), so the total can differ slightly from a provider's bill.</p>
    </section>
  )
}

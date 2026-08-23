"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"
import { DataTable } from "@/components/data/data-table"

/**
 * Client body for the Fund Tax page. The column `render`/`value` callbacks must
 * live in a Client Component — functions can't be passed from a Server Component
 * to a Client Component (that RSC-serialization error is what crashed the page).
 * The server page passes only serializable data (rows, summary, year).
 */
export type FundTaxRow = { id: string; name: string; type: string; issued: boolean }

function GenerateK1s({ fundId, year, outstanding }: { fundId: string; year: number; outstanding: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run() {
    setErr(null); setMsg(null); setBusy(true)
    try {
      const res = await fetch(`/api/portfolio/funds/${fundId}/k1/generate`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ taxYear: year }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d?.error ?? "Generation failed."); return }
      const skipped = (d.skipped ?? []).length
      setMsg(`Generated ${d.generated} K-1${d.generated === 1 ? "" : "s"} for ${year}${skipped ? `, ${skipped} skipped` : ""}.${d.fromLedger ? " Fund income defaulted from the ledger — confirm before filing." : ""}`)
      router.refresh()
    } catch (e: any) {
      setErr(e?.message ?? "Network error.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-4 py-3">
      <div className="flex-1 min-w-[220px]">
        <div className="text-sm font-medium">Generate K-1s for {year}</div>
        <div className="text-[12px] text-muted-foreground">
          Engine-computed per-LP allocations + capital rollforward, filed to each LP's data room. {outstanding} outstanding.
        </div>
      </div>
      {msg && <span className="text-[12px] text-emerald-600 dark:text-emerald-400 max-w-sm">{msg}</span>}
      {err && <span className="text-[12px] text-red-600 dark:text-red-400 max-w-sm">{err}</span>}
      <button
        onClick={run} disabled={busy}
        className="shrink-0 rounded-md border border-foreground/15 px-3 py-1.5 text-sm hover:border-foreground/40 disabled:opacity-50"
      >
        {busy ? "Generating…" : `Generate ${year} K-1s`}
      </button>
    </div>
  )
}

export function FundTaxClient({ rows, year, summary, fundId }: { rows: FundTaxRow[]; year: number; summary: Metric[]; fundId?: string | null }) {
  const outstanding = rows.filter((r) => !r.issued).length
  return (
    <>
      <MetricTiles metrics={summary} columns={4} />
      {fundId && rows.length > 0 && (
        <div className="mt-8">
          <GenerateK1s fundId={fundId} year={year} outstanding={outstanding} />
        </div>
      )}
      <div className="mt-8">
        <DataTable
          rows={rows}
          getRowId={(r) => r.id}
          exportName={`k1-status-${year}`}
          searchPlaceholder="Search investors…"
          emptyText="No investors on file."
          columns={[
            { key: "name", header: "Investor", value: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "type", header: "Type", value: (r) => r.type, render: (r) => <span className="text-muted-foreground capitalize">{String(r.type).replace(/_/g, " ")}</span> },
            {
              key: "issued", header: `K-1 ${year}`, value: (r) => (r.issued ? 1 : 0),
              render: (r) => r.issued
                ? <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Issued</span>
                : <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">Outstanding</span>,
            },
          ]}
        />
      </div>
    </>
  )
}

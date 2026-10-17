"use client"

interface Txn { date: string; type: "contribution" | "distribution"; title: string; reference: number; amount: number; paymentRef: string | null }
export interface AccountData {
  statement: { fundName: string; lpName: string; currency: string; asOf: string; summary: { commitment: number | null; contributed: number; distributed: number; uncalled: number | null; estimatedNav: number | null; dpi: number | null; tvpi: number | null; rvpi: number | null }; transactions: Txn[] } | null
  notices: Array<{ type: string; title: string; at: string | null; status: string; amount: number }>
  documents: Array<{ id: string; title: string; category: string; filename: string; sizeBytes: number; at: string }>
}
const CAT: Record<string, string> = { tax: "Tax document", annual_statement: "Annual statement", notice: "Notice", other: "Document" }
const STATUS: Record<string, string> = { pending: "Pending", sent: "Sent", paid: "Paid", waived: "Waived", defaulted: "Overdue", notified: "Notified" }

/** The investor's account: the numbers with the records behind them, the notices they were issued, the documents published to them, and the statement as a PDF (docs/architecture/60 section 8). */
export function LpAccountCard({ token, data }: { token: string; data: AccountData }) {
  const s = data.statement
  const cur = s?.currency ?? "USD"
  const money = (n: number | null) => (n == null ? "n/a" : new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n))
  const x = (n: number | null) => (n == null ? "n/a" : `${n.toFixed(2)}x`)
  if (!s && data.notices.length === 0 && data.documents.length === 0) return null
  return (
    <section className="rounded-xl border p-5" aria-labelledby="acct-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="acct-h" className="text-lg font-semibold">Your account</h2>
        {s && <a className="rounded-md border px-3 py-1.5 text-xs" href={`/api/portal/${token}/statement`}>Download statement (PDF)</a>}
      </div>
      {s && (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            {([["Commitment", money(s.summary.commitment)], ["Called and paid", money(s.summary.contributed)], ["Not yet called", money(s.summary.uncalled)], ["Distributed", money(s.summary.distributed)]] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-base font-medium">{v}</dd></div>)}
            <div><dt className="text-xs text-muted-foreground">Estimated value of your share</dt><dd className="text-base font-medium">{money(s.summary.estimatedNav)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Distributions to paid-in</dt><dd className="text-base font-medium">{x(s.summary.dpi)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Total value to paid-in (estimate)</dt><dd className="text-base font-medium">{x(s.summary.tvpi)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">As of {s.asOf}. The estimated value is based on the fund&apos;s latest recorded valuations and your ownership share. It is an estimate, not a valuation of record, and not tax or investment advice.</p>
          <h3 className="mt-4 text-sm font-medium">Payments and distributions</h3>
          {s.transactions.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">Nothing has been paid or distributed yet.</p> : (
            <table className="mt-1 w-full text-left text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="py-1">Date</th><th>What</th><th>Reference</th><th className="text-right">Amount</th></tr></thead>
              <tbody>{s.transactions.map((t, i) => <tr key={i} className="border-t"><td className="py-1.5">{t.date}</td><td>{t.type === "contribution" ? "Contribution" : "Distribution"}: {t.title}</td><td className="text-muted-foreground">{t.paymentRef ?? `#${t.reference}`}</td><td className="text-right">{t.type === "distribution" ? "+" : "-"}{money(t.amount)}</td></tr>)}</tbody></table>)}
        </>)}
      {data.notices.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-medium">Notices you were issued</h3>
          <ul className="mt-1 divide-y text-sm">{data.notices.map((n, i) => <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span>{n.at ?? ""} · {n.type}: {n.title}</span><span className="text-muted-foreground">{money(n.amount)} · {STATUS[n.status] ?? n.status}</span></li>)}</ul>
        </>)}
      {data.documents.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-medium">Documents from the fund</h3>
          <ul className="mt-1 divide-y text-sm">{data.documents.map((d) => <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><a className="underline" href={`/api/portal/${token}/doc/${d.id}`}>{d.title}</a><span className="text-xs text-muted-foreground">{CAT[d.category] ?? d.category} · {d.at}</span></li>)}</ul>
        </>)}
    </section>
  )
}

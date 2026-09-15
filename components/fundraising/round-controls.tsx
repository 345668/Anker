"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { RaiseRound } from "@/lib/fundraising/rounds"

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "SGD", "JPY", "AED", "INR"]
export function RoundControls({ rounds, selected, boards, workspace, canEdit }: {
  rounds: RaiseRound[]; selected?: RaiseRound; boards: { id: string; name: string }[]; workspace: string; canEdit: boolean
}) {
  const router = useRouter()
  const [creating, setCreating] = useState(!rounds.length)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const data = new FormData(event.currentTarget)
    setPending(true); setError(null)
    try {
      const response = await fetch("/api/fundraising/rounds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: data.get("name"), boardId: data.get("boardId"), currency: data.get("currency"), target: Number(data.get("target")) }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setCreating(false)
      router.push(`/dashboard/fundraising/pipeline?round=${encodeURIComponent(result.round.id)}`)
      router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create round. Try again.") }
    finally { setPending(false) }
  }
  return <section className="platform-panel p-5 mb-6" aria-label="Fundraising round">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs text-muted-foreground mb-2">{workspace} · Your private fundraising rounds</p>
        {rounds.length ? <><label className="block text-sm mb-2" htmlFor="active-round">Active round</label><select id="active-round" className="border border-input rounded bg-background p-2 min-h-11" value={selected?.id ?? ""} onChange={e => router.push(`/dashboard/fundraising/pipeline?round=${encodeURIComponent(e.target.value)}`)}>{rounds.map(r => <option key={r.id} value={r.id}>{r.name} · {r.currency}</option>)}</select></> : <h2 className="text-xl">Set up your fundraising round</h2>}
      </div>
      {canEdit && <button className="border border-input rounded px-4 min-h-11" onClick={() => { setCreating(!creating); setError(null) }}>{creating ? "Close setup" : "New round"}</button>}
    </div>
    {creating && canEdit && (boards.length ? <form className="grid sm:grid-cols-2 gap-4 mt-5" onSubmit={create} aria-busy={pending}>
      <label className="grid gap-2 text-sm">Round name<input name="name" required maxLength={120} placeholder="Seed round" className="border border-input rounded p-3 bg-background" /></label>
      <label className="grid gap-2 text-sm">Investor board<select name="boardId" required className="border border-input rounded p-3 bg-background">{boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm">Currency<select name="currency" className="border border-input rounded p-3 bg-background">{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="grid gap-2 text-sm">Target<input name="target" type="number" min="0" max="1000000000000" step="0.01" required className="border border-input rounded p-3 bg-background" /></label>
      <p className="sm:col-span-2 text-sm text-muted-foreground">All check sizes on this board will use the selected currency. Check existing amounts first; this does not convert them. Use a separate board for each round. Moving a contact between boards changes the round totals.</p>
      <button disabled={pending} className="min-h-11 rounded bg-primary text-primary-foreground px-4">{pending ? "Creating…" : "Create round"}</button>
    </form> : <p className="mt-4 text-sm">Create an available investor board in <Link className="underline" href="/dashboard/crm">Relationships</Link> to start another round.</p>)}
    {error && <p className="mt-4 text-[var(--platform-danger)]" role="alert">{error}</p>}
  </section>
}

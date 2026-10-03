"use client"

import { useCallback, useEffect, useState } from "react"

interface Consent { email: string; basis: string; note: string | null; attested_at: string }
const LABEL: Record<string, string> = { prior_express_consent: "Prior express consent", existing_customer: "Existing customer" }

export function ConsentManager() {
  const [rows, setRows] = useState<Consent[] | null>(null)
  const [email, setEmail] = useState("")
  const [basis, setBasis] = useState("prior_express_consent")
  const [note, setNote] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch("/api/outreach/consent", { cache: "no-store" })
    setRows(r.ok ? (await r.json()).consents : [])
  }, [])
  useEffect(() => { load() }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      const r = await fetch("/api/outreach/consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, basis, note: note || null }) })
      const d = await r.json()
      if (r.ok) { setEmail(""); setNote("") }
      setMsg(r.ok ? "Recorded." : d.error || "Could not record")
      await load()
    } finally { setBusy(false) }
  }
  async function revoke(addr: string) {
    await fetch("/api/outreach/consent", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: addr }) })
    await load()
  }

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Anker does not send outreach email to recipients in Germany or other EU/EEA countries unless you record that the
        person gave you prior express consent, or is an existing customer. This is your own statement, stored with the time. You
        can withdraw it at any time. Elsewhere no record is needed.
      </p>
      <form onSubmit={save} className="grid max-w-3xl gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[1fr_auto]">
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="recipient@example.com" className="h-9 rounded-md border border-border bg-background px-3 text-sm" />
        <select value={basis} onChange={(e) => setBasis(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
          <option value="prior_express_consent">Prior express consent</option>
          <option value="existing_customer">Existing customer</option>
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="How and when was consent given? (kept for your records)" className="h-9 rounded-md border border-border bg-background px-3 text-sm sm:col-span-2" />
        <div className="flex items-center gap-3 sm:col-span-2">
          <button disabled={busy} className="h-9 rounded-md px-4 text-sm disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Record</button>
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
        </div>
      </form>
      <div className="max-w-3xl overflow-hidden rounded-xl border border-border bg-card">
        {rows === null ? <div className="p-4 text-sm text-muted-foreground">Loading…</div> : rows.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No attestations yet.</div> : (
          <table className="w-full text-sm"><tbody>
            {rows.map((r) => (
              <tr key={r.email} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5"><div className="font-mono text-xs">{r.email}</div>{r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{LABEL[r.basis] ?? r.basis}<br />{new Date(r.attested_at).toLocaleDateString("en-GB")}</td>
                <td className="px-4 py-2.5 text-right"><button onClick={() => revoke(r.email)} className="text-xs text-muted-foreground underline hover:text-foreground">Withdraw</button></td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
    </div>
  )
}

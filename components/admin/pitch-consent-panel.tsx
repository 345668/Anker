"use client"

import { useCallback, useEffect, useState } from "react"

interface Blocked { email: string; name: string | null; country: string | null; entries: number }
type Basis = "prior_express_consent" | "existing_customer"

export function PitchConsentPanel() {
  const [rows, setRows] = useState<Blocked[] | null>(null)
  const [basis, setBasis] = useState<Record<string, Basis>>({})
  const [note, setNote] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/pitch-consent", { cache: "no-store" })
    setRows(r.ok ? (await r.json()).blocked : [])
  }, [])
  useEffect(() => { load() }, [load])

  async function attest(email: string) {
    setBusy(email); setMsg(null)
    try {
      const r = await fetch("/api/admin/pitch-consent", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, basis: basis[email] ?? "prior_express_consent", note: note[email] || null }) })
      const d = await r.json()
      setMsg(r.ok ? `Recorded for ${email}. ${d.requeued} held email(s) are back in the queue.` : d.error || "Could not record")
      await load()
    } finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground max-w-3xl">
        These investors are in Germany or another EU/EEA country. German law treats unsolicited marketing email as unlawful
        without the recipient&apos;s prior express consent, so Anker holds the email. Attest only if you have that consent or an
        existing relationship. Your statement is stored with your name and the time.
      </p>
      {msg && <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">{msg}</div>}
      {rows === null ? <div className="text-sm text-muted-foreground">Loading…</div> : rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">Nothing is being held.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5">Recipient</th><th className="px-4 py-2.5">Country</th><th className="px-4 py-2.5 text-right">Held</th><th className="px-4 py-2.5">Basis</th><th className="px-4 py-2.5">Note</th><th className="px-4 py-2.5" />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.email} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5"><div className="font-medium">{r.name ?? r.email}</div><div className="font-mono text-[11px] text-muted-foreground">{r.email}</div></td>
                  <td className="px-4 py-2.5">{r.country ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.entries}</td>
                  <td className="px-4 py-2.5">
                    <select value={basis[r.email] ?? "prior_express_consent"} onChange={(e) => setBasis({ ...basis, [r.email]: e.target.value as Basis })} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                      <option value="prior_express_consent">Prior express consent</option>
                      <option value="existing_customer">Existing relationship</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5"><input value={note[r.email] ?? ""} onChange={(e) => setNote({ ...note, [r.email]: e.target.value })} placeholder="How was consent given?" className="h-8 w-56 rounded-md border border-border bg-background px-2 text-xs" /></td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => attest(r.email)} disabled={busy === r.email} className="h-8 rounded-md px-3 text-xs disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Attest and release</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

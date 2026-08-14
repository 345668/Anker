"use client"

import { useEffect, useState } from "react"
import { Share2, Copy, Check, Loader2, X, Link as LinkIcon } from "lucide-react"

type Grant = {
  id: string
  token: string
  grantee_email: string
  watermark: boolean
  expires_at: string | null
  created_at: string
  revoked_at: string | null
}

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never")

export function ShareRoomPanel() {
  const [open, setOpen] = useState(false)
  const [grants, setGrants] = useState<Grant[]>([])
  const [email, setEmail] = useState("")
  const [expiry, setExpiry] = useState("14")
  const [watermark, setWatermark] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [origin, setOrigin] = useState("")

  useEffect(() => { setOrigin(window.location.origin) }, [])
  useEffect(() => { if (open) load() }, [open])

  async function load() {
    try {
      const r = await fetch("/api/dataroom/founder/share")
      const d = await r.json()
      setGrants(d.grants ?? [])
    } catch { /* ignore */ }
  }

  async function create() {
    if (!email.trim()) return
    setBusy(true)
    try {
      const r = await fetch("/api/dataroom/founder/share", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ granteeEmail: email.trim(), expiresInDays: expiry ? Number(expiry) : null, watermark }),
      })
      if (r.ok) { setEmail(""); await load() }
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  async function revoke(id: string) {
    setGrants((g) => g.map((x) => (x.id === id ? { ...x, revoked_at: new Date().toISOString() } : x)))
    try { await fetch(`/api/dataroom/founder/share?id=${id}`, { method: "DELETE" }) } catch { /* ignore */ }
  }

  function copy(token: string) {
    const url = `${origin}/room/${token}`
    navigator.clipboard?.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied(null), 1500)
  }

  const active = grants.filter((g) => !g.revoked_at)

  return (
    <div className="border border-foreground/10 rounded-xl overflow-hidden mb-6">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-foreground/[0.02]">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-8 h-8 rounded-md bg-[#e5380f]/10 text-[#e5380f]"><Share2 className="w-4 h-4" /></span>
          <div className="text-left">
            <div className="text-sm font-medium">Share room</div>
            <div className="text-xs text-muted-foreground">{active.length} active {active.length === 1 ? "link" : "links"} · watermarked, expiring, tracked</div>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Manage"}</span>
      </button>

      {open && (
        <div className="border-t border-foreground/10 p-5 space-y-5">
          {/* Create */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Investor email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="investor@fund.com" type="email"
                className="rounded-lg border border-foreground/15 px-3 py-2 text-sm focus:outline-none focus:border-foreground/40 w-56" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Expires (days)</span>
              <input value={expiry} onChange={(e) => setExpiry(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="14"
                className="rounded-lg border border-foreground/15 px-3 py-2 text-sm focus:outline-none focus:border-foreground/40 w-24 tabular-nums" />
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
              <button type="button" onClick={() => setWatermark((v) => !v)} className={`grid place-items-center w-4 h-4 rounded border ${watermark ? "bg-foreground border-foreground text-background" : "border-foreground/30"}`}>{watermark ? <Check className="w-3 h-3" /> : null}</button>
              Watermark
            </label>
            <button onClick={create} disabled={busy || !email.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#e5380f] px-4 py-2 text-sm font-medium text-white hover:bg-[#c72f0c] disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />} Create link
            </button>
          </div>

          {/* Active grants */}
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active share links. Create one to give an investor read-only access.</p>
          ) : (
            <ul className="divide-y divide-foreground/[0.06] border-t border-foreground/10">
              {active.map((g) => (
                <li key={g.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{g.grantee_email}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">Expires {fmtDate(g.expires_at)}{g.watermark ? " · watermarked" : ""}</div>
                  </div>
                  <button onClick={() => copy(g.token)} className="inline-flex items-center gap-1.5 rounded-md border border-foreground/15 px-2.5 py-1 text-xs hover:bg-foreground/[0.04]">
                    {copied === g.token ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy link</>}
                  </button>
                  <button onClick={() => revoke(g.id)} title="Revoke" className="p-1.5 text-muted-foreground hover:text-rose-600 rounded-md hover:bg-foreground/[0.04]"><X className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

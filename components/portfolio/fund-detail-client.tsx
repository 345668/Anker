"use client"

/**
 * Fund profile + LP membership table.
 *
 * Layout:
 *   - Header: fund name, slug, vintage, status, currency
 *   - Profile form: target size, fees, term, manager
 *   - Rollup cards: # LPs, total committed, total called, uncalled, % subscribed
 *   - LP table: name, type, commitment, called, distributed, ownership %, status
 *   - Add LP panel + inline edit on existing rows
 *
 * When multi-fund support arrives, this becomes the /[slug] route and the
 * sidebar surfaces a fund-switcher.  Today there's only the one fund so we
 * skip the switcher entirely.
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Save, Loader2, CheckCircle2, AlertTriangle, Plus, Trash2,
  Users, Wallet, Percent, ArrowRight, Mail, FileText,
} from "lucide-react"
import type {
  FundFull, FundLpFull, FundLpRollup, FundStatus, LpType, LpStatus,
} from "@/lib/portfolio/funds"
import { ContactPicker } from "@/components/portfolio/contact-picker"

interface Props {
  initialFund: FundFull
  initialLps: FundLpFull[]
  initialRollup: FundLpRollup
}

const FUND_STATUS_OPTS: { value: FundStatus; label: string }[] = [
  { value: "fundraising", label: "Fundraising" },
  { value: "active",      label: "Active" },
  { value: "harvesting",  label: "Harvesting" },
  { value: "closed",      label: "Closed" },
]
const LP_TYPE_OPTS: { value: LpType | ""; label: string }[] = [
  { value: "",                label: "—" },
  { value: "family_office",   label: "Family Office" },
  { value: "institutional",   label: "Institutional" },
  { value: "hnwi",            label: "HNWI" },
  { value: "corporate",       label: "Corporate" },
  { value: "fund_of_funds",   label: "FoF / Secondary" },
]
const LP_STATUS_OPTS: { value: LpStatus; label: string }[] = [
  { value: "committed",     label: "Committed" },
  { value: "fully_called",  label: "Fully called" },
  { value: "defaulted",     label: "Defaulted" },
  { value: "transferred",   label: "Transferred" },
]

export function FundDetailClient({ initialFund, initialLps, initialRollup }: Props) {
  const [fund, setFund] = useState(initialFund)
  const [lps, setLps] = useState(initialLps)
  const [rollup, setRollup] = useState(initialRollup)
  const [savingFund, setSavingFund] = useState(false)
  const [showAddLp, setShowAddLp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function setF<K extends keyof FundFull>(key: K, val: FundFull[K]) {
    setFund((p) => ({ ...p, [key]: val }))
  }

  async function saveFund() {
    setSavingFund(true); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fund.name,
          description: fund.description,
          vintageYear: fund.vintage_year,
          targetSize: fund.target_size,
          currency: fund.currency,
          managementFeePct: fund.management_fee_pct,
          carryPct: fund.carry_pct,
          termYears: fund.term_years,
          investmentPeriodYears: fund.investment_period_years,
          status: fund.status,
          managerOrg: fund.manager_org,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`)
      setFund(data.fund)
      // Rollup's pct_subscribed depends on target_size — refresh.
      await refreshRollup()
      setSuccess("Fund saved.")
    } catch (e: any) { setError(e?.message ?? "Save failed") }
    finally { setSavingFund(false) }
  }

  async function refreshRollup() {
    const r = await fetch(`/api/portfolio/funds/${fund.id}`)
    if (!r.ok) return
    const d = await r.json().catch(() => ({}))
    if (d?.rollup) setRollup(d.rollup)
    if (Array.isArray(d?.lps)) setLps(d.lps)
  }

  async function addLp(body: any) {
    setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/lps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Add LP failed (${res.status})`)
      await refreshRollup()
      setShowAddLp(false)
      setSuccess(`Added ${data.lp.lp_name}.`)
    } catch (e: any) { setError(e?.message ?? "Add LP failed") }
  }

  async function patchLp(lpId: string, patch: any) {
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/lps/${lpId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? `Update failed (${res.status})`)
      }
      await refreshRollup()
    } catch (e: any) { setError(e?.message ?? "Update failed") }
  }

  async function removeLp(lpId: string, name: string) {
    if (!confirm(`Remove ${name} from this fund?`)) return
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/lps/${lpId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? `Delete failed (${res.status})`)
      }
      await refreshRollup()
      setSuccess(`Removed ${name}.`)
    } catch (e: any) { setError(e?.message ?? "Delete failed") }
  }

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/portfolio"
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Portfolio
        </Link>
        <div className="mt-3 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl md:text-4xl tracking-tight">
              {fund.name}
            </h1>
            <div className="mt-2 flex items-center gap-3 flex-wrap text-xs font-mono uppercase tracking-wider text-muted-foreground">
              <span>slug: {fund.slug}</span>
              {fund.vintage_year && <span>· vintage {fund.vintage_year}</span>}
              <span>· {fund.currency}</span>
              <span>· {fund.status}</span>
            </div>
          </div>
          <button
            type="button" onClick={saveFund} disabled={savingFund}
            className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {savingFund ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save fund
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs font-mono text-rose-600 border border-rose-500/30 bg-rose-500/5 rounded-md inline-flex items-center gap-2">
          <AlertTriangle className="w-3 h-3" /> {error}
        </div>
      )}
      {success && (
        <div className="px-3 py-2 text-xs font-mono text-emerald-700 border border-emerald-500/30 bg-emerald-500/5 rounded-md inline-flex items-center gap-2">
          <CheckCircle2 className="w-3 h-3" /> {success}
        </div>
      )}

      {/* Fund profile form */}
      <section className="border border-foreground/10 rounded-md p-6 grid md:grid-cols-3 gap-x-6 gap-y-4">
        <h2 className="md:col-span-3 font-display text-lg tracking-tight">Fund profile</h2>
        <Field label="Name">
          <input type="text" value={fund.name} onChange={(e) => setF("name", e.target.value)} className={input} />
        </Field>
        <Field label="Manager">
          <input type="text" value={fund.manager_org ?? ""} onChange={(e) => setF("manager_org", e.target.value)} className={input} />
        </Field>
        <Field label="Currency">
          <input type="text" value={fund.currency} onChange={(e) => setF("currency", e.target.value.toUpperCase().slice(0, 4))} maxLength={4} className={input} />
        </Field>
        <Field label="Vintage year">
          <input type="number" value={fund.vintage_year ?? ""} onChange={(e) => setF("vintage_year", e.target.value ? Number(e.target.value) : null)} className={input} />
        </Field>
        <Field label={`Target size (${fund.currency})`}>
          <input type="number" step="100000" value={fund.target_size ?? ""} onChange={(e) => setF("target_size", e.target.value ? Number(e.target.value) : null)} className={input} />
        </Field>
        <Field label="Status">
          <select value={fund.status} onChange={(e) => setF("status", e.target.value as FundStatus)} className={input}>
            {FUND_STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Management fee %" hint="0.02 = 2%">
          <input type="number" step="0.001" min="0" max="0.1" value={fund.management_fee_pct ?? ""} onChange={(e) => setF("management_fee_pct", e.target.value ? Number(e.target.value) : null)} className={input} />
        </Field>
        <Field label="Carry %" hint="0.20 = 20%">
          <input type="number" step="0.01" min="0" max="0.5" value={fund.carry_pct ?? ""} onChange={(e) => setF("carry_pct", e.target.value ? Number(e.target.value) : null)} className={input} />
        </Field>
        <Field label="Term (years)">
          <input type="number" min="0" max="20" value={fund.term_years ?? ""} onChange={(e) => setF("term_years", e.target.value ? Number(e.target.value) : null)} className={input} />
        </Field>
        <Field label="Investment period (years)">
          <input type="number" min="0" max="10" value={fund.investment_period_years ?? ""} onChange={(e) => setF("investment_period_years", e.target.value ? Number(e.target.value) : null)} className={input} />
        </Field>
        <Field label="Description" className="md:col-span-3">
          <textarea value={fund.description ?? ""} onChange={(e) => setF("description", e.target.value)} rows={2} className={`${input} resize-y`} />
        </Field>
      </section>

      {/* LP rollup cards */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-px bg-foreground/10 border border-foreground/10 rounded-md overflow-hidden">
        <Rollup label="LPs"             value={rollup.total_lps.toString()} />
        <Rollup label="Committed"       value={shortMoney(rollup.total_committed, fund.currency)} />
        <Rollup label="Called"          value={shortMoney(rollup.total_called, fund.currency)} />
        <Rollup label="Uncalled"        value={shortMoney(rollup.uncalled_remaining, fund.currency)} />
        <Rollup
          label="% subscribed"
          value={rollup.pct_subscribed != null
            ? `${(rollup.pct_subscribed * 100).toFixed(1)}%`
            : "—"}
          sub={rollup.pct_subscribed != null ? `of ${shortMoney(fund.target_size ?? 0, fund.currency)} target` : "set target size to enable"}
        />
      </section>

      {/* LP table */}
      <section className="border border-foreground/10 rounded-md overflow-hidden">
        <div className="px-5 py-3 border-b border-foreground/10 flex items-center justify-between">
          <h2 className="font-display text-lg tracking-tight">Limited Partners</h2>
          <button
            type="button"
            onClick={() => setShowAddLp((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-foreground/15 hover:bg-foreground/5"
          >
            <Plus className="w-3 h-3" /> Add LP
          </button>
        </div>

        {showAddLp && (
          <AddLpPanel onSubmit={addLp} onCancel={() => setShowAddLp(false)} currency={fund.currency} />
        )}

        {lps.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Users className="w-6 h-6 mx-auto mb-2 opacity-40" />
            No LPs yet. Click "Add LP" to start.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-foreground/[0.02] text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-normal">LP</th>
                  <th className="text-left px-3 py-2 font-normal">Type</th>
                  <th className="text-left px-3 py-2 font-normal">Contact</th>
                  <th className="text-right px-3 py-2 font-normal">Commitment</th>
                  <th className="text-right px-3 py-2 font-normal">Called</th>
                  <th className="text-right px-3 py-2 font-normal">Distributed</th>
                  <th className="text-right px-3 py-2 font-normal">%</th>
                  <th className="text-left px-3 py-2 font-normal">Status</th>
                  <th className="text-left px-3 py-2 font-normal">Signed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lps.map((lp) => (
                  <LpRow
                    key={lp.id}
                    lp={lp}
                    currency={fund.currency}
                    onPatch={(p) => patchLp(lp.id, p)}
                    onDelete={() => removeLp(lp.id, lp.lp_name)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

const input = "w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background"

function Field({
  label, hint, children, className,
}: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between">
        <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
          {label}
        </label>
        {hint && <span className="text-[10px] font-mono text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Rollup({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-background p-4 lg:p-5">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="font-display text-xl lg:text-2xl mt-1 tracking-tight">{value}</div>
      {sub && <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

function LpRow({
  lp, currency, onPatch, onDelete,
}: {
  lp: FundLpFull
  currency: string
  onPatch: (patch: any) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    lp_name: lp.lp_name,
    lp_type: lp.lp_type ?? "",
    commitment_amount: lp.commitment_amount ?? "",
    called_amount: lp.called_amount ?? 0,
    distributed_amount: lp.distributed_amount ?? 0,
    status: lp.status,
    signed_at: lp.signed_at ?? "",
    /** When non-null AND different from lp.lp_contact_id, we send it in
     *  the PATCH. When the user explicitly UNLINKS (picker clears the chip),
     *  we set this to "" and send null to the API to detach. */
    lp_contact_id: lp.lp_contact_id ?? null as string | null,
  })

  async function save() {
    const patch: any = {
      lpName: draft.lp_name,
      lpType: draft.lp_type || null,
      commitmentAmount: draft.commitment_amount === "" ? null : Number(draft.commitment_amount),
      calledAmount: Number(draft.called_amount),
      distributedAmount: Number(draft.distributed_amount),
      status: draft.status,
      signedAt: draft.signed_at || null,
    }
    // Only thread lpContactId when it changed — leaves the column alone otherwise.
    if (draft.lp_contact_id !== (lp.lp_contact_id ?? null)) {
      patch.lpContactId = draft.lp_contact_id
    }
    await onPatch(patch)
    setEditing(false)
  }

  if (editing) {
    return (
      <tr className="border-t border-foreground/5 bg-foreground/[0.02]">
        <td className="px-4 py-2"><input type="text" value={draft.lp_name} onChange={(e) => setDraft({ ...draft, lp_name: e.target.value })} className="w-full h-7 px-2 text-xs border border-foreground/15 rounded bg-background" /></td>
        <td className="px-3 py-2">
          <select value={draft.lp_type ?? ""} onChange={(e) => setDraft({ ...draft, lp_type: e.target.value as any })} className="h-7 px-1 text-xs border border-foreground/15 rounded bg-background">
            {LP_TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </td>
        <td className="px-3 py-2">
          <ContactPicker
            contactId={draft.lp_contact_id}
            onChange={(id) => setDraft({ ...draft, lp_contact_id: id })}
            defaultName={draft.lp_name}
          />
        </td>
        <td className="px-3 py-2 text-right"><input type="number" step="10000" value={draft.commitment_amount} onChange={(e) => setDraft({ ...draft, commitment_amount: e.target.value as any })} className="w-28 h-7 px-2 text-xs border border-foreground/15 rounded bg-background text-right font-mono" /></td>
        <td className="px-3 py-2 text-right"><input type="number" step="10000" value={draft.called_amount} onChange={(e) => setDraft({ ...draft, called_amount: e.target.value as any })} className="w-28 h-7 px-2 text-xs border border-foreground/15 rounded bg-background text-right font-mono" /></td>
        <td className="px-3 py-2 text-right"><input type="number" step="10000" value={draft.distributed_amount} onChange={(e) => setDraft({ ...draft, distributed_amount: e.target.value as any })} className="w-28 h-7 px-2 text-xs border border-foreground/15 rounded bg-background text-right font-mono" /></td>
        <td className="px-3 py-2 text-right text-[10px] font-mono text-muted-foreground">{lp.ownership_pct != null ? `${(lp.ownership_pct * 100).toFixed(2)}%` : "—"}</td>
        <td className="px-3 py-2">
          <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as LpStatus })} className="h-7 px-1 text-xs border border-foreground/15 rounded bg-background">
            {LP_STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </td>
        <td className="px-3 py-2"><input type="date" value={draft.signed_at ?? ""} onChange={(e) => setDraft({ ...draft, signed_at: e.target.value })} className="h-7 px-2 text-xs border border-foreground/15 rounded bg-background" /></td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <button onClick={save} className="text-xs px-2 py-1 rounded bg-foreground text-background mr-1">Save</button>
          <button onClick={() => setEditing(false)} className="text-xs px-2 py-1 rounded border border-foreground/15">Cancel</button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-t border-foreground/5 hover:bg-foreground/[0.02]">
      <td className="px-4 py-2 font-medium">{lp.lp_name}</td>
      <td className="px-3 py-2 text-[10px] font-mono uppercase text-muted-foreground">
        {(lp.lp_type ?? "—").replace(/_/g, " ")}
      </td>
      <td className="px-3 py-2">
        {lp.lp_contact_id ? (
          lp.contact_email ? (
            <a href={`mailto:${lp.contact_email}`}
              className="inline-flex items-center gap-1 text-xs text-foreground hover:underline">
              <Mail className="w-3 h-3" />
              <span className="font-mono truncate max-w-[200px]">{lp.contact_email}</span>
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-mono">
              <Mail className="w-3 h-3" /> linked · no email
            </span>
          )
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-rose-500 font-mono">
            <Mail className="w-3 h-3" /> none
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">{lp.commitment_amount != null ? shortMoney(lp.commitment_amount, currency) : "—"}</td>
      <td className="px-3 py-2 text-right font-mono text-xs">{shortMoney(lp.called_amount, currency)}</td>
      <td className="px-3 py-2 text-right font-mono text-xs">{shortMoney(lp.distributed_amount, currency)}</td>
      <td className="px-3 py-2 text-right font-mono text-xs">{lp.ownership_pct != null ? `${(lp.ownership_pct * 100).toFixed(2)}%` : "—"}</td>
      <td className="px-3 py-2 text-[10px] font-mono uppercase">{lp.status.replace(/_/g, " ")}</td>
      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{lp.signed_at ?? "—"}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {/* Capital account statement — per-LP transaction history + summary.
            Opens in a new tab so the LP's profile context here isn't lost. */}
        <Link
          href={`/dashboard/portfolio/fund/lps/${lp.id}/statement`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5 mr-1"
          title="View capital account statement"
        >
          <FileText className="w-3 h-3" />
          Statement
        </Link>
        <button onClick={() => setEditing(true)} className="text-xs px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5 mr-1">Edit</button>
        <button onClick={onDelete} className="text-xs px-2 py-1 rounded border border-rose-500/30 text-rose-600 hover:bg-rose-500/5"><Trash2 className="w-3 h-3" /></button>
      </td>
    </tr>
  )
}

function AddLpPanel({
  onSubmit, onCancel, currency,
}: {
  onSubmit: (body: any) => Promise<void>
  onCancel: () => void
  currency: string
}) {
  const [name, setName] = useState("")
  const [type, setType] = useState<string>("")
  const [commitment, setCommitment] = useState("")
  const [signed, setSigned] = useState("")
  /** Contact attached at create time. Optional — operator can wire later
   *  via the row's Edit button. */
  const [contactId, setContactId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await onSubmit({
        lpName: name.trim(),
        lpType: type || null,
        commitmentAmount: commitment ? Number(commitment) : null,
        signedAt: signed || null,
        lpContactId: contactId,
      })
      setName(""); setType(""); setCommitment(""); setSigned(""); setContactId(null)
    } finally { setBusy(false) }
  }

  return (
    <div className="px-5 py-4 border-b border-foreground/10 bg-foreground/[0.02] space-y-3">
      <div className="grid md:grid-cols-4 gap-3">
        <Field label="LP name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Family Office" className={input} autoFocus />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)} className={input}>
            {LP_TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label={`Commitment (${currency})`}>
          <input type="number" step="10000" value={commitment} onChange={(e) => setCommitment(e.target.value)} className={input} />
        </Field>
        <Field label="Signed">
          <input type="date" value={signed} onChange={(e) => setSigned(e.target.value)} className={input} />
        </Field>
      </div>
      <Field label="Contact (for notice emails)" hint="Optional — pick existing or create new">
        <div className="flex items-center gap-2">
          <ContactPicker
            contactId={contactId}
            onChange={(id) => setContactId(id)}
            defaultName={name}
          />
          {!contactId && (
            <span className="text-[10px] text-muted-foreground italic">
              LPs without contacts can't receive notice emails.
            </span>
          )}
        </div>
      </Field>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button" onClick={submit} disabled={busy || !name.trim()}
          className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </button>
        <button type="button" onClick={onCancel} className="h-9 px-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5">
          Cancel
        </button>
      </div>
    </div>
  )
}

function shortMoney(n: number, currency: string): string {
  if (!n) return `${currency} 0`
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${currency} ${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${currency} ${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${currency} ${(n / 1e3).toFixed(0)}K`
  return `${currency} ${n.toFixed(0)}`
}

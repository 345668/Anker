"use client"

/**
 * Campaign Builder Wizard — 4-step flow.
 *
 *   1. Source   — pull pool from Neon investors / crm_entries + optional XLSX
 *   2. Score    — LP-mix sliders + target count + tier bands → shortlist
 *   3. Verify   — regex + role drop + prior bounces + DNS MX
 *   4. Draft    — pick template + AI provider, kick off draft generation
 *
 * Everything is a POST to a dedicated endpoint; the UI is a thin driver
 * that shows results between steps so the user can course-correct.
 */
import { useCallback, useState } from "react"
import Link from "next/link"

interface Campaign {
  id: string
  name: string
  description: string | null
  eventTopic: string | null
  eventDate: string | null
  eventUrl: string | null
  ccAddresses: string[]
}

interface Stats {
  pool: number
  selected: number
  verified: number
  byTier: { t1: number; t2: number; t3: number }
}

type Step = 1 | 2 | 3 | 4

export function CampaignBuilderWizard({
  campaign,
  initialStats,
}: {
  campaign: Campaign
  initialStats: Stats
}) {
  const [step, setStep] = useState<Step>(1)
  const [stats, setStats] = useState<Stats>(initialStats)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])

  const push = useCallback((line: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString()}  ${line}`]), [])

  async function callJson<T = any>(path: string, body?: any): Promise<T> {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
    return j as T
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <header className="border-b border-foreground/10 pb-4">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Link href="/dashboard/outreach" className="hover:underline">← Outreach</Link>
          <span>·</span>
          <span>Campaign builder</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{campaign.name}</h1>
        {campaign.description && (
          <p className="mt-1 text-sm text-muted-foreground">{campaign.description}</p>
        )}
      </header>

      {/* Stepper */}
      <nav className="flex items-center gap-2 text-xs">
        {(["Source", "Shortlist", "Verify", "Draft"] as const).map((label, i) => {
          const n = (i + 1) as Step
          const active = n === step
          const done = n < step
          return (
            <button
              key={n}
              onClick={() => setStep(n)}
              className={
                "rounded-full px-3 py-1.5 font-mono uppercase tracking-wider transition-colors " +
                (active ? "bg-foreground text-background"
                       : done   ? "bg-foreground/10 text-foreground"
                                : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10")
              }
            >
              {n}. {label}
            </button>
          )
        })}
      </nav>

      {err && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Current stats banner */}
      <section className="grid grid-cols-2 gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 sm:grid-cols-4">
        <Stat label="Pool" value={stats.pool} />
        <Stat label="Shortlisted" value={stats.selected} />
        <Stat label="Email verified" value={stats.verified} />
        <Stat label="T1 · T2 · T3" value={`${stats.byTier.t1} · ${stats.byTier.t2} · ${stats.byTier.t3}`} />
      </section>

      {/* Steps */}
      {step === 1 && (
        <StepSource
          campaign={campaign}
          busy={busy}
          setBusy={setBusy}
          setErr={setErr}
          push={push}
          onDone={(s) => { setStats((prev) => ({ ...prev, pool: s.total })); setStep(2) }}
        />
      )}
      {step === 2 && (
        <StepScore
          campaign={campaign}
          busy={busy}
          setBusy={setBusy}
          setErr={setErr}
          push={push}
          callJson={callJson}
          onDone={(r) => { setStats((prev) => ({ ...prev, selected: r.selected, byTier: r.byTier })); setStep(3) }}
        />
      )}
      {step === 3 && (
        <StepVerify
          campaign={campaign}
          busy={busy}
          setBusy={setBusy}
          setErr={setErr}
          push={push}
          callJson={callJson}
          onDone={(r) => { setStats((prev) => ({ ...prev, verified: r.byStatus?.valid || 0 })); setStep(4) }}
        />
      )}
      {step === 4 && (
        <StepDraft
          campaign={campaign}
          busy={busy}
          setBusy={setBusy}
          setErr={setErr}
          push={push}
        />
      )}

      {/* Activity log */}
      {log.length > 0 && (
        <section className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Activity</h3>
          <ul className="space-y-1 font-mono text-xs">
            {log.slice(-20).map((l, i) => <li key={i} className="text-foreground/70">{l}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 1 · Source
// ────────────────────────────────────────────────────────────────────────
function StepSource(props: {
  campaign: Campaign; busy: boolean; setBusy: (b: boolean) => void
  setErr: (s: string | null) => void; push: (l: string) => void
  onDone: (result: { total: number }) => void
}) {
  const [neonInvestors, setNeonInvestors] = useState(true)
  const [neonCrm, setNeonCrm] = useState(true)
  const [file, setFile] = useState<File | null>(null)

  async function run() {
    props.setErr(null); props.setBusy(true)
    try {
      const form = new FormData()
      form.append("sources", JSON.stringify({ neonInvestors, neonCrm }))
      if (file) form.append("file", file)
      props.push("Importing pool from selected sources…")
      const r = await fetch(`/api/outreach/campaigns/${props.campaign.id}/import-pool`, {
        method: "POST",
        body: form,
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      props.push(`Pool: ${j.poolSize} unique (added ${j.added}). Coverage: ${j.coverage.emailAndLinkedin} both, ${j.coverage.emailOnly} email, ${j.coverage.linkedinOnly} linkedin.`)
      props.onDone({ total: j.poolSize })
    } catch (e: any) {
      props.setErr(e?.message || "Import failed")
    } finally {
      props.setBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-foreground/10 bg-background p-6">
      <h2 className="text-lg font-semibold">1 · Source</h2>
      <p className="text-sm text-muted-foreground">
        Pull the candidate pool from your Neon data and optionally add rows from an XLSX
        (e.g. today's LinkedIn network export).
      </p>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={neonInvestors} onChange={(e) => setNeonInvestors(e.target.checked)} />
          Neon <code>investors</code> table
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={neonCrm} onChange={(e) => setNeonCrm(e.target.checked)} />
          Neon <code>crm_entries</code> table
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Optional XLSX (LinkedIn export or profiles)</span>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
      </div>
      <button
        onClick={run}
        disabled={props.busy}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/85 disabled:opacity-60"
      >
        {props.busy ? "Importing…" : "Import pool"}
      </button>
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 2 · Score + Shortlist
// ────────────────────────────────────────────────────────────────────────
function StepScore(props: {
  campaign: Campaign; busy: boolean; setBusy: (b: boolean) => void
  setErr: (s: string | null) => void; push: (l: string) => void
  callJson: <T = any>(path: string, body?: any) => Promise<T>
  onDone: (result: { selected: number; byTier: Stats["byTier"] }) => void
}) {
  const [target, setTarget] = useState(500)
  const [mixFo, setMixFo] = useState(60)
  const [mixHnw, setMixHnw] = useState(30)
  const [mixMfo, setMixMfo] = useState(10)
  const [t1Cap, setT1Cap] = useState(100)
  const [t2Min, setT2Min] = useState(60)

  const total = mixFo + mixHnw + mixMfo

  async function run() {
    props.setErr(null); props.setBusy(true)
    try {
      const mix = {
        family_office: mixFo / 100,
        hnw_angel:     mixHnw / 100,
        mfo_ifo:       mixMfo / 100,
      }
      props.push(`Scoring pool with mix ${mixFo}/${mixHnw}/${mixMfo}, target=${target}…`)
      const j = await props.callJson<any>(`/api/outreach/campaigns/${props.campaign.id}/score-shortlist`, {
        target, mix, tierBands: { t1Cap, t2Min },
      })
      props.push(`Scored ${j.scored}, selected ${j.selected}. T1=${j.byTier.t1}, T2=${j.byTier.t2}, T3=${j.byTier.t3}.`)
      props.onDone({ selected: j.selected, byTier: j.byTier })
    } catch (e: any) {
      props.setErr(e?.message || "Scoring failed")
    } finally {
      props.setBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-foreground/10 bg-background p-6">
      <h2 className="text-lg font-semibold">2 · Score + shortlist</h2>
      <p className="text-sm text-muted-foreground">
        Score every pool member using the IP-topic model, then pick the top-N respecting the LP-type mix.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Target size">
          <input type="number" value={target} onChange={(e) => setTarget(parseInt(e.target.value || "0", 10))}
                 className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"/>
        </Field>
        <Field label={`Family office · ${mixFo}%`}>
          <input type="range" min={0} max={100} value={mixFo} onChange={(e) => setMixFo(parseInt(e.target.value, 10))} className="w-full"/>
        </Field>
        <Field label={`HNW angel · ${mixHnw}%`}>
          <input type="range" min={0} max={100} value={mixHnw} onChange={(e) => setMixHnw(parseInt(e.target.value, 10))} className="w-full"/>
        </Field>
        <Field label={`MFO / IFO · ${mixMfo}%`}>
          <input type="range" min={0} max={100} value={mixMfo} onChange={(e) => setMixMfo(parseInt(e.target.value, 10))} className="w-full"/>
        </Field>
        <Field label="T1 cap (top-N)">
          <input type="number" value={t1Cap} onChange={(e) => setT1Cap(parseInt(e.target.value || "0", 10))}
                 className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"/>
        </Field>
        <Field label="T2 min score">
          <input type="number" value={t2Min} onChange={(e) => setT2Min(parseInt(e.target.value || "0", 10))}
                 className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"/>
        </Field>
      </div>
      {total !== 100 && (
        <p className="text-xs text-amber-600">Mix sums to {total}%, not 100. That's OK — remainder goes to the largest bucket.</p>
      )}
      <button
        onClick={run}
        disabled={props.busy}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/85 disabled:opacity-60"
      >
        {props.busy ? "Scoring…" : "Score + build shortlist"}
      </button>
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 3 · Verify
// ────────────────────────────────────────────────────────────────────────
function StepVerify(props: {
  campaign: Campaign; busy: boolean; setBusy: (b: boolean) => void
  setErr: (s: string | null) => void; push: (l: string) => void
  callJson: <T = any>(path: string, body?: any) => Promise<T>
  onDone: (result: { byStatus: Record<string, number> }) => void
}) {
  const [byStatus, setByStatus] = useState<Record<string, number> | null>(null)

  async function run() {
    props.setErr(null); props.setBusy(true)
    try {
      props.push("Verifying shortlist emails (regex + role drop + prior bounces + DNS MX)…")
      const j = await props.callJson<any>(`/api/outreach/campaigns/${props.campaign.id}/verify-emails`)
      props.push(`Verified ${j.verified}. Valid=${j.byStatus?.valid ?? 0}, role=${j.byStatus?.role ?? 0}, bounced_june=${j.byStatus?.bounced_june ?? 0}, no_mx=${j.byStatus?.no_mx ?? 0}, invalid=${j.byStatus?.format_invalid ?? 0}, no_email=${j.byStatus?.no_email ?? 0}.`)
      setByStatus(j.byStatus || {})
      props.onDone({ byStatus: j.byStatus || {} })
    } catch (e: any) {
      props.setErr(e?.message || "Verification failed")
    } finally {
      props.setBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-foreground/10 bg-background p-6">
      <h2 className="text-lg font-semibold">3 · Verify emails (local, free)</h2>
      <p className="text-sm text-muted-foreground">
        Format regex → drop role addresses (info@, contact@, …) → cross-ref against prior bounces → DNS MX lookup.
        This isn't as thorough as a paid verifier but tends to drop the obvious 20-30% of guessed emails that caused the June bounce spike.
      </p>
      <button
        onClick={run}
        disabled={props.busy}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/85 disabled:opacity-60"
      >
        {props.busy ? "Verifying…" : "Verify emails"}
      </button>
      {byStatus && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(byStatus).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="mt-1 text-lg font-semibold">{v}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 4 · Draft (reuses existing /draft endpoint)
// ────────────────────────────────────────────────────────────────────────
function StepDraft(props: {
  campaign: Campaign; busy: boolean; setBusy: (b: boolean) => void
  setErr: (s: string | null) => void; push: (l: string) => void
}) {
  return (
    <section className="space-y-4 rounded-xl border border-foreground/10 bg-background p-6">
      <h2 className="text-lg font-semibold">4 · Draft + review</h2>
      <p className="text-sm text-muted-foreground">
        Draft generation uses the existing outreach engine + template picker. Jump into the
        campaign detail view to pick a template, kick off AI drafting for the verified shortlist,
        review, and send.
      </p>
      <Link
        href={`/dashboard/outreach/campaigns/${props.campaign.id}`}
        className="inline-block rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/85"
      >
        Open campaign →
      </Link>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
